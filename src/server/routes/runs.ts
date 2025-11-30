import { querySelectEvent } from '@/server/queries';
import { getSession } from '@/server/session';
import type { Routes } from '@/server/types';
import {
  apiBadRequest,
  apiData,
  apiForbidden,
  apiNotFound,
  apiServerError,
  apiUnauthorized
} from '@/server/utils/responses';
import type { WebSocketServer } from '@/server/webSocket';
import type { BunRequest } from 'bun';
import { sql } from 'bun';

export function createRunsRoutes(wsServer: WebSocketServer): Routes {
  return {
    '/api/events/:eventId/run': {
      GET: async (req: BunRequest<'/api/events/:eventId/run'>) => {
        const session = await getSession(req);

        if (!session) {
          return apiUnauthorized();
        }

        const { eventId } = req.params;

        const event = await querySelectEvent(eventId, session.user_id);

        if (!event) {
          return apiForbidden();
        }

        try {
          // Get run
          const runs: {
            status: string;
            grace_period: number;
            active_id: string | null;
            active_phase: string | null;
            active_start_time: string | null;
            active_has_timer: boolean | null;
          }[] = await sql`
            SELECT status, grace_period, active_id, active_phase, active_start_time, active_has_timer
            FROM runs
            WHERE event_id = ${eventId}
          `;

          if (runs.length === 0) {
            return apiNotFound();
          }

          const run = runs[0]!;

          // Get active item details if exists
          let activeQuestion = null;
          let activeSlide = null;

          if (
            run.active_id &&
            (run.active_phase === 'prompt' || run.active_phase === 'answer' || run.active_phase === 'ended')
          ) {
            const questions: {
              id: string;
              number: number;
              type: string;
              max_points: number;
              seconds: number;
            }[] = await sql`SELECT id, number, type, max_points, seconds FROM questions WHERE id = ${run.active_id}`;

            if (questions.length > 0) {
              const q = questions[0]!;

              activeQuestion = {
                id: q.id,
                number: q.number,
                type: q.type,
                maxPoints: q.max_points,
                seconds: q.seconds
              };
            }
          } else if (run.active_id && run.active_phase === 'slide') {
            const slides: {
              id: string;
              number: number;
              content: string;
            }[] = await sql`SELECT id, number, content FROM slides WHERE id = ${run.active_id}`;

            if (slides.length > 0) {
              const s = slides[0]!;

              activeSlide = {
                id: s.id,
                number: s.number,
                content: s.content
              };
            }
          }

          return apiData({
            eventName: event.name,
            run: { status: run.status, gracePeriod: run.grace_period, activeQuestion, activeSlide }
          });
        } catch (error) {
          return apiServerError();
        }
      }
    },
    '/api/events/:eventId/run/navigate': {
      POST: async (req: BunRequest<'/api/events/:eventId/run/navigate'>) => {
        const session = await getSession(req);

        if (!session) {
          return apiUnauthorized();
        }

        const { eventId } = req.params;

        try {
          const body = await req.json();
          const { direction, slideNumber, questionId, phase } = body;

          // Check permissions
          const permissions: { role_id: string }[] = await sql`
            SELECT role_id FROM permissions
            WHERE user_id = ${session.user_id} AND event_id = ${eventId} AND role_id IN ('owner', 'admin')
          `;

          if (permissions.length === 0) {
            return apiForbidden();
          }

          // Get current run state
          const runs: {
            active_id: string | null;
            active_phase: string | null;
          }[] = await sql`
            SELECT active_id, active_phase FROM runs WHERE event_id = ${eventId}
          `;

          if (runs.length === 0) {
            return apiNotFound();
          }

          const run = runs[0]!;
          let newActiveId: string | null = null;
          let newActivePhase: 'slide' | 'prompt' | 'answer' | 'ended' | null = null;

          // Handle direct navigation (slideNumber or questionId + phase)
          if (slideNumber !== undefined) {
            const slides: { id: string }[] = await sql`
              SELECT id FROM slides WHERE event_id = ${eventId} AND number = ${slideNumber}
            `;

            if (slides.length > 0) {
              newActiveId = slides[0]!.id;
              newActivePhase = 'slide';
            } else {
              return apiBadRequest('Slide not found');
            }
          } else if (questionId && phase) {
            if (!['prompt', 'answer', 'ended'].includes(phase)) {
              return apiBadRequest('Invalid phase for question');
            }

            const questions: { id: string }[] = await sql`
              SELECT id FROM questions WHERE id = ${questionId} AND event_id = ${eventId}
            `;

            if (questions.length === 0) {
              return apiBadRequest('Question not found');
            }

            newActiveId = questionId;
            newActivePhase = phase as 'prompt' | 'answer' | 'ended';
          } else if (direction === 'next' || direction === 'previous') {
            // Handle next/previous navigation
            if (!run.active_id || !run.active_phase) {
              // No active item, go to first slide or first question
              const slides: { id: string; number: number }[] = await sql`
                SELECT id, number FROM slides WHERE event_id = ${eventId} ORDER BY number ASC LIMIT 1
              `;

              if (slides.length > 0) {
                newActiveId = slides[0]!.id;
                newActivePhase = 'slide';
              } else {
                const questions: { id: string; number: number }[] = await sql`
                  SELECT id, number FROM questions WHERE event_id = ${eventId} ORDER BY number ASC LIMIT 1
                `;

                if (questions.length > 0) {
                  newActiveId = questions[0]!.id;
                  newActivePhase = 'prompt';
                }
              }
            } else if (run.active_phase === 'slide') {
              // Currently on slide
              const currentSlides: { number: number }[] = await sql`
                SELECT number FROM slides WHERE id = ${run.active_id}
              `;

              if (currentSlides.length > 0) {
                const currentNumber = currentSlides[0]!.number;

                if (direction === 'next') {
                  const nextSlides: { id: string }[] = await sql`
                    SELECT id FROM slides WHERE event_id = ${eventId} AND number > ${currentNumber} ORDER BY number ASC LIMIT 1
                  `;

                  if (nextSlides.length > 0) {
                    newActiveId = nextSlides[0]!.id;
                    newActivePhase = 'slide';
                  } else {
                    // No more slides, go to first question
                    const questions: { id: string }[] = await sql`
                      SELECT id FROM questions WHERE event_id = ${eventId} ORDER BY number ASC LIMIT 1
                    `;

                    if (questions.length > 0) {
                      newActiveId = questions[0]!.id;
                      newActivePhase = 'prompt';
                    }
                  }
                } else {
                  // Previous
                  const prevSlides: { id: string }[] = await sql`
                    SELECT id FROM slides WHERE event_id = ${eventId} AND number < ${currentNumber} ORDER BY number DESC LIMIT 1
                  `;

                  if (prevSlides.length > 0) {
                    newActiveId = prevSlides[0]!.id;
                    newActivePhase = 'slide';
                  }
                }
              }
            } else {
              // Currently on question (prompt, answer, or ended)
              const currentQuestions: { id: string; number: number }[] = await sql`
                SELECT id, number FROM questions WHERE id = ${run.active_id}
              `;

              if (currentQuestions.length > 0) {
                const currentQuestion = currentQuestions[0]!;

                if (direction === 'next') {
                  // Cycle through phases: prompt -> answer -> ended -> next question prompt
                  if (run.active_phase === 'prompt') {
                    newActiveId = run.active_id;
                    newActivePhase = 'answer';
                  } else if (run.active_phase === 'answer') {
                    newActiveId = run.active_id;
                    newActivePhase = 'ended';
                  } else if (run.active_phase === 'ended') {
                    // Go to next question prompt
                    const nextQuestions: { id: string }[] = await sql`
                      SELECT id FROM questions WHERE event_id = ${eventId} AND number > ${currentQuestion.number} ORDER BY number ASC LIMIT 1
                    `;

                    if (nextQuestions.length > 0) {
                      newActiveId = nextQuestions[0]!.id;
                      newActivePhase = 'prompt';
                    }
                  }
                } else {
                  // Previous
                  if (run.active_phase === 'ended') {
                    newActiveId = run.active_id;
                    newActivePhase = 'answer';
                  } else if (run.active_phase === 'answer') {
                    newActiveId = run.active_id;
                    newActivePhase = 'prompt';
                  } else if (run.active_phase === 'prompt') {
                    // Go to previous question ended
                    const prevQuestions: { id: string }[] = await sql`
                      SELECT id FROM questions WHERE event_id = ${eventId} AND number < ${currentQuestion.number} ORDER BY number DESC LIMIT 1
                    `;

                    if (prevQuestions.length > 0) {
                      newActiveId = prevQuestions[0]!.id;
                      newActivePhase = 'ended';
                    } else {
                      // No previous question, go to last slide
                      const lastSlides: { id: string }[] = await sql`
                        SELECT id FROM slides WHERE event_id = ${eventId} ORDER BY number DESC LIMIT 1
                      `;

                      if (lastSlides.length > 0) {
                        newActiveId = lastSlides[0]!.id;
                        newActivePhase = 'slide';
                      }
                    }
                  }
                }
              }
            }
          } else {
            return apiBadRequest('Invalid navigation parameters');
          }

          // Update the run if we have a new state
          if (newActiveId && newActivePhase) {
            await sql`
              UPDATE runs
              SET active_id = ${newActiveId},
                  active_phase = ${newActivePhase}
              WHERE event_id = ${eventId}
            `;
          }

          // Fetch updated run state with details
          const updatedRuns: {
            event_id: string;
            status: string;
            grace_period: number;
            active_id: string | null;
            active_phase: string | null;
            active_start_time: string | null;
            active_has_timer: boolean | null;
          }[] = await sql`
            SELECT event_id, status, grace_period, active_id, active_phase, active_start_time, active_has_timer
            FROM runs
            WHERE event_id = ${eventId}
          `;

          const updatedRun = updatedRuns[0]!;
          let activeQuestion = null;
          let activeSlide = null;

          if (
            updatedRun.active_id &&
            (updatedRun.active_phase === 'prompt' ||
              updatedRun.active_phase === 'answer' ||
              updatedRun.active_phase === 'ended')
          ) {
            const questions: {
              id: string;
              number: number;
              type: string;
              max_points: number;
              seconds: number;
            }[] = await sql`
              SELECT id, number, type, max_points, seconds
              FROM questions
              WHERE id = ${updatedRun.active_id}
            `;

            if (questions.length > 0) {
              const q = questions[0]!;

              activeQuestion = {
                id: q.id,
                number: q.number,
                type: q.type,
                maxPoints: q.max_points,
                seconds: q.seconds
              };
            }
          } else if (updatedRun.active_id && updatedRun.active_phase === 'slide') {
            const slides: {
              id: string;
              number: number;
              content: string;
            }[] = await sql`
              SELECT id, number, content
              FROM slides
              WHERE id = ${updatedRun.active_id}
            `;

            if (slides.length > 0) {
              const s = slides[0]!;

              activeSlide = {
                id: s.id,
                number: s.number,
                content: s.content
              };
            }
          }

          return apiData({
            run: {
              eventId: updatedRun.event_id,
              status: updatedRun.status,
              gracePeriod: updatedRun.grace_period,
              activeQuestion,
              activeSlide
            }
          });
        } catch (error) {
          return apiServerError();
        }
      }
    }
  };
}
