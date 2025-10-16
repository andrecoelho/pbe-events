interface Props {
  backgroundColor?: string;
  indicatorColor?: string;
}

export const Loading = ({ backgroundColor: bgColor = '', indicatorColor = 'bg-accent' }: Props) => (
  <div className={`${bgColor} absolute inset-0 flex flex-col items-center justify-center`}>
    <span className={`loading loading-ring loading-xl ${indicatorColor}`} />
  </div>
);
