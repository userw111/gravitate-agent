declare module "html-docx-js/dist/html-docx" {
  const htmlDocx: {
    asBlob: (html: string, options?: unknown) => Blob;
    asArrayBuffer?: (html: string, options?: unknown) => ArrayBuffer;
  };
  export default htmlDocx;
}


