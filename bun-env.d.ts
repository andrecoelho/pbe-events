declare module "*.png" {
  /**
   * A path to the PNG file
   */
  const path: `${string}.png`;
  export = path;
}

declare module "*.webp" {
  /**
   * A path to the WEBP file
   */
  const path: `${string}.webp`;
  export = path;
}

declare module "*.svg" {
  /**
   * A path to the SVG file
   */
  const path: `${string}.svg`;
  export = path;
}

declare module "*.css" {
  /**
   * A record of class names to their corresponding CSS module classes
   */
  const classes: { readonly [key: string]: string };
  export = classes;
}

declare module "*.sql" {
  /**
   * A record of SQL queries
   */
  const queries: string;
  export = queries;
}
