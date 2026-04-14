// Allows TypeScript to accept bare CSS side-effect imports (e.g. globals.css)
declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}
