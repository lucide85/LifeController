// @types/pdf-parse only declares the package root ("pdf-parse"). We import the
// inner module ("pdf-parse/lib/pdf-parse.js") to dodge the package's debug branch
// that crashes under bundlers, so declare that path here.
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
    text: string;
  }
  function pdfParse(
    dataBuffer: Buffer | Uint8Array,
    options?: Record<string, unknown>
  ): Promise<PdfParseResult>;
  export default pdfParse;
}
