declare module "virtual:site-content" {
  const content: {
    pages: {
      slug: string;
      title: string;
      html: string;
      section: string;
      description: string;
      headings: { id: string; label: string; level: number }[];
      source: string;
      searchText: string;
    }[];
    groups: string[];
    base: string;
    repository: string;
  };
  export default content;
}
