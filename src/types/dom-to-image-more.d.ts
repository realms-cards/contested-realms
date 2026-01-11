declare module "dom-to-image-more" {
  interface Options {
    filter?: (node: Node) => boolean;
    bgcolor?: string;
    width?: number;
    height?: number;
    style?: Record<string, string>;
    quality?: number;
    imagePlaceholder?: string;
    cacheBust?: boolean;
  }

  function toPng(node: Node, options?: Options): Promise<string>;
  function toJpeg(node: Node, options?: Options): Promise<string>;
  function toBlob(node: Node, options?: Options): Promise<Blob>;
  function toPixelData(
    node: Node,
    options?: Options
  ): Promise<Uint8ClampedArray>;
  function toSvg(node: Node, options?: Options): Promise<string>;
  function toCanvas(node: Node, options?: Options): Promise<HTMLCanvasElement>;

  const domtoimage: {
    toPng: typeof toPng;
    toJpeg: typeof toJpeg;
    toBlob: typeof toBlob;
    toPixelData: typeof toPixelData;
    toSvg: typeof toSvg;
    toCanvas: typeof toCanvas;
  };

  export { toPng, toJpeg, toBlob, toPixelData, toSvg, toCanvas, Options };
  export default domtoimage;
}
