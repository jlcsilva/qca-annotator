import React from "react";
import Switch from '@mui/material/Switch'; 
import Button from '@mui/material/Button'; 
import { FormControlLabel, IconButton } from "@mui/material";
import UndoIcon from '@mui/icons-material/Undo';
import { saveAs } from 'file-saver'
import ClearIcon from '@mui/icons-material/Clear';
import { Point } from "./Point";
import { PixelLine } from "./PixelLine";
import { FluidLine } from "./FluidLine";
import AbstractLine from "./AbstractLine";

type CanvasProps = {
  backgroundImage: HTMLImageElement,                                            // URL of the initial background image  
  maxLines: number                                                              // Maximum number of lines to be drawn
}
type CanvasState = {
  height: number,                                                               // Height of the canvas
  width: number,                                                                // Width of the canvas
  lines: AbstractLine[],                                                        // Either the array of pixelLines or fluidLines
  pixelLines: PixelLine[],                                                      // Pixelized lines to be plotted in the canvas
  fluidLines: FluidLine[],                                                      // Fluid lines to be plotted in the canvas
  editMode: boolean                                                             // Whether canvas edition is enabled or not
}

// FIXME rendering pixel lines is slower

export class Canvas extends React.Component<CanvasProps, CanvasState> {
  // Default properties of the Canvas class
  private static scaleFactor: number = 1.1;                                     // Scale factor applied per click or mouse wheel rotation
  private static maxZoomOut: number = 0.2;                                      // Maximum zoomout factor
  private static lineWidth: number = 1;                                         // Line width
  private static lineColor: string = '#00FF00';                                 // Line color

  // Brightness settings
  private static _defaultBrightness = 100;                                     
  private static _maxBrightness = 200;
  private static _minBrightness = 0;

  // Contrast settings
  private static _defaultContrast = 100;      
  private static _maxContrast = 1000;
  private static _minContrast = 0;                                  


  // User-interaction state
  private mouseIsDown: boolean = false;                                         // Indicates whether the mouse is currently down
  private dragStart: Point | null = null;                                       // Point where the user started dragging or null
  private dragged: boolean = true;                                              // Whether the image has finished being dragged
  private zoomFactor: number = 1;                                               // Current zoom factor
  private startPoint: Point = { x: 0, y: 0 };                                   // Starting mouse click position
  private endPoint: Point = { x: 0, y: 0 };                                     // Final mouse click position
  private lastObjectType: typeof FluidLine | typeof PixelLine | null = null;    // Type of the last object added, allowing to undo operations

  // Canvas elements
  private canvasRef: React.RefObject<HTMLCanvasElement>;                        // Canvas reference
  private ctx: CanvasRenderingContext2D | null = null;                          // Canvas rendering context
  private _brightness: number;                                                  // Brightness filter
  private _contrast: number;                                                    // Contrast filter
  private svg = document.createElementNS("http://www.w3.org/2000/svg",'svg');   // SVG namespace, used as an auxiliary for the transformation
  private xform: DOMMatrix = this.svg.createSVGMatrix();                        // Transformation matrix between the initial canvas context and the current one
  private savedTransforms: DOMMatrix[] = [];                                    // Stack of saved transformation

  // Initial canvas state
  state: CanvasState = {                                          
    height: 512, 
    width: 512, 
    lines: [],
    pixelLines: [],
    fluidLines: [], 
    editMode: true
  };
  
  /* ********************************************************************** */
  // Image data extracted from the canvas' background image
  private originalImageData: ImageData | undefined | null = null;
  //private updatedImageData: ImageData | undefined | null = null;
  private promiseNumber: number = 0;        // Promises counter
  /* ********************************************************************** */

  // Creates a reference to the canvas and sets the initial state
  constructor(props: CanvasProps) {
    super(props);
    this._brightness = Canvas.defaultBrightness;
    this._contrast = Canvas.defaultContrast;
    this.canvasRef = React.createRef();
    this.props.backgroundImage.onload = () => {
      // Use a promise so that the program waits for the image to be draw to get its data
      let promiseCount = ++this.promiseNumber;
      new Promise((resolve) => {
        this.ctx?.drawImage(this.props.backgroundImage, 0, 0);
        resolve(promiseCount);
      }).then(() => {
        this.originalImageData = this.ctx?.getImageData(0, 0, this.state.width, this.state.height);
      })
      
      this.setState(
        { height: this.props.backgroundImage.height, width: this.props.backgroundImage.width},
      );
    }
  }

  // Adds a listener for the wheel event, retrieves the rendering context, 
  // modifies it to track transforms, and saves the default canvas state
  componentDidMount() {
    this.canvasRef.current?.addEventListener('wheel', this.handleScroll, { passive: false });
    let ctx = this.canvasRef.current?.getContext("2d");
    if(ctx != null) {
      this.ctx = ctx;
      this.trackTransforms();
      this.ctx.lineWidth = Canvas.lineWidth;
      this.ctx.strokeStyle = Canvas.lineColor;
      this.ctx.fillStyle = Canvas.lineColor;
      this.ctx.imageSmoothingEnabled = false;
      // Save the current canvas state as the default
      this.ctx.save();
    }
  }

  componentDidUpdate() {
    this.redraw();
  }

  // Before the component umnounts, remove the wheel event listener
  componentWillUnmount() {
    this.canvasRef.current?.removeEventListener('wheel', this.handleScroll, { passive: false} as EventListenerOptions);
  }

  // Getters
  public getOriginalImageData = (): Uint8ClampedArray | undefined | null => { 
    // Returns a clone, to the prevent data corruption from the outside
    return this.originalImageData?.data.map((x) => x); 
  }
  public get lines(): AbstractLine[] { return this.state.lines }
  public get height(): number { return this.state.height }
  public get width(): number { return this.state.width }
  public get brightness(): number { return this._brightness }
  public static get defaultBrightness(): number { return Canvas._defaultBrightness }
  public static get maxBrightness(): number { return Canvas._maxBrightness }
  public static get minBrightness(): number { return Canvas._minBrightness }
  public get contrast(): number { return this._contrast }
  public static get defaultContrast(): number { return Canvas._defaultContrast }
  public static get maxContrast(): number { return Canvas._maxContrast }
  public static get minContrast(): number { return Canvas._minContrast }
  
  // Setters
  public static set defaultBrightness(defaultBrightness: number) { Canvas._defaultBrightness = defaultBrightness }
  public static set defaultContrast(defaultContrast: number) { Canvas._defaultContrast = defaultContrast }
  public set brightness(brightness: number) { 
    this._brightness = brightness;
    this.redraw();
  }
  public set contrast(contrast: number) {
    this._contrast = contrast;
    this.redraw();
  }
  public setFilters = (brightness: number, contrast: number) => {
    this.contrast = contrast;
    this.brightness = brightness;
    this.redraw();
  }

  /***************************************************************************************************/
  /****************************************** Public methods *****************************************/
  /***************************************************************************************************/

  /************************ Line addition and stenosis percentage computation ************************/
  // Add a fluid line to the canvas, if the number of fluid lines is below the maximum and there are no pixel lines
  public addFluidLine = (line: FluidLine, save: boolean = true) => {
    if(this.state.fluidLines.length < this.props.maxLines && this.state.pixelLines.length === 0) {
      this.lastObjectType = FluidLine;
      line.draw(this.ctx as CanvasRenderingContext2D);
      if(save) {
        this.setState(prevState => ({
          lines: [...prevState.lines, line],
          fluidLines: [...prevState.fluidLines, line],
          editMode: this.state.editMode && prevState.lines.length + 1 < this.props.maxLines
        }));
      }
    }
  }

  // Add a pixel line to the canvas, if the number of pixel lines is below the maximum and there are no fluid lines
  public addPixelLine = (pixelLine: PixelLine, save: boolean = true) => {
    if(this.state.pixelLines.length < this.props.maxLines && this.state.fluidLines.length === 0) {
      this.lastObjectType = PixelLine;
      pixelLine.draw(this.ctx as CanvasRenderingContext2D);
      if(save) {
        this.setState(prevState => ({
          lines: [...prevState.lines, pixelLine],
          pixelLines: [...prevState.pixelLines, pixelLine],
          editMode: this.state.editMode && prevState.lines.length + 1 < this.props.maxLines
        }));
      }
    }
  }

  // Given the three drawn lines or pixel lines, computes the associated diameter stenosis percentage
  public computeDiameterStenosisPercentage = (): number | undefined => {
    var lengthsArray: number[] = [];
    if(this.lines.length !== this.props.maxLines) return undefined;
    else lengthsArray = this.lines.map(line => line.length).sort((a, b) => a - b);
    return 2 * lengthsArray[0] / (lengthsArray[1] + lengthsArray[2]) * 100;
  }

  // Given the three drawn lines or pixel lines, computes the associated area stenosis percentage
  public computeAreaStenosisPercentage = (): number | undefined => {
    var lengthsArray: number[] = [];
    if(this.lines.length !== this.props.maxLines) return undefined;
    else lengthsArray = this.lines.map(line => line.length).sort((a, b) => a - b);
    return 2 * Math.PI * Math.pow(0.5*lengthsArray[0], 2) / ( Math.PI * Math.pow(0.5*lengthsArray[1], 2) + Math.PI * Math.pow(0.5*lengthsArray[2], 2)) * 100;
  }

  /******************************* Download and download URL functions *******************************/
  public getDownloadURL = (): string => {
    this.ctx?.restore();
    this.ctx?.save();
    this.clearCanvas();
    this.ctx?.putImageData(this.originalImageData as ImageData, 0, 0);
    this.state.fluidLines.forEach((fluidLine) => fluidLine.draw(this.ctx as CanvasRenderingContext2D));
    this.state.pixelLines.forEach((pixelLine) => pixelLine.draw(this.ctx as CanvasRenderingContext2D));
    return this.canvasRef.current ? this.canvasRef.current.toDataURL("image/png") : "";
  }

  private downloadImage = () => {
    saveAs(this.getDownloadURL(), 'file.png');
  }

  /***************************************************************************************************/
  /**************************************** Private functions ****************************************/
  /***************************************************************************************************/

  /***************************************** Canvas drawing ******************************************/
  // Clear the entire canvas
  private clearCanvas = () => {
    let p1 = this.transformPoint({x: 0, y: 0});
    let p2 = this.transformPoint({x: this.canvasRef.current?.width as number, y: this.canvasRef.current?.height as number});
    this.ctx?.clearRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
  }

  // Clear the canvas, redraw all its elements, and update the image data object
  private redraw = () => {
    this.clearCanvas();
    this.ctx?.drawImage(this.props.backgroundImage, 0, 0);
    let brightnessFilter = "brightness(" + this.brightness + "%)";
    let contrastFilter = "contrast(" + this.contrast + "%)";
    (this.ctx as CanvasRenderingContext2D).filter = brightnessFilter + contrastFilter;
    this.state.fluidLines.forEach((fluidLine) => fluidLine.draw(this.ctx as CanvasRenderingContext2D));
    this.state.pixelLines.forEach((pixelLine) => pixelLine.draw(this.ctx as CanvasRenderingContext2D));
  }

  /****************************************** Mouse events *******************************************/
  // Get the (x, y) position of the mouse event e
  private getMouseEventPosition = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>): Point => {
    return {
      x: e.pageX - (e.target as HTMLCanvasElement).offsetLeft,
      y: e.pageY - (e.target as HTMLCanvasElement).offsetTop
    };
  }

  // In editing mode, register the position and that the mouse is down. Otherwise, start a drag
  private handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
    this.startPoint = this.getMouseEventPosition(e);
    if(this.state.editMode) this.mouseIsDown = true;
    else {
      this.dragStart = this.transformPoint(this.startPoint);
      this.dragged = false;
    }
  }

  // In editing mode with the mouse down, draw a line, and put the mouse up. Otherwise, finish a drag
  private handleMouseLeave = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {  
    if(this.state.editMode && this.mouseIsDown) {
      this.mouseIsDown = false;
      this.addFluidLine(new FluidLine(this.transformPoint(this.startPoint), this.transformPoint(this.endPoint)));
      this.setState({ editMode: this.state.editMode && this.state.fluidLines.length < this.props.maxLines});
    } else {
      this.dragged = true;
      this.dragStart = null;
    }
  }

  // In editing mode, if the mouse is down, draw a line. Otherwise, if the image was not in the middle of a drag, zoom
  private handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
    this.endPoint = this.getMouseEventPosition(e);
    if(this.state.editMode) {
      if(this.mouseIsDown) {
        let lastPt = this.transformPoint(this.endPoint);
        this.mouseIsDown = false;
        this.addFluidLine(new FluidLine(this.transformPoint(this.startPoint), lastPt));
      }
    } else {
      if(this.dragged) this.zoom(e.shiftKey ? -1 : 1);
      this.dragStart = null;
    }
  }

  // In editing mode, if the mouse is down, draw a line from between the mouse click point and the current one. 
  // Otherwise, if a drag has been started, continue it
  private handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
    this.endPoint = this.getMouseEventPosition(e);
    if(this.state.editMode) {
      if(this.mouseIsDown) {
        this.redraw();
        new FluidLine(this.transformPoint(this.startPoint), this.transformPoint(this.endPoint)).draw(this.ctx as CanvasRenderingContext2D);
      }
    } else if (this.dragStart) {
      let pt = this.transformPoint(this.endPoint);
      this.ctx?.translate(pt.x - this.dragStart.x, pt.y - this.dragStart.y);
      this.redraw();
    }
  }

  // Zoom based on the scroll length and direction
  private handleScroll = (e: WheelEvent) => {
    e.preventDefault();
    let delta = e.deltaY ? - e.deltaY/40 : e.detail ? e.detail : 0;
    if(delta) this.zoom(delta);
  }

  /****************************************** Button clicks ******************************************/
  // Set editMode based on the previous editMode value and the number of lines drawn on the canvas
  private toggleEdit = () => {
    this.setState({editMode: !this.state.editMode && this.state.fluidLines.length < this.props.maxLines});
  }

  // Undo the last action, which can be a FluidLine or PixelLine draw
  private undoLast = () => {
    if(this.lastObjectType === FluidLine) {
      this.setState(prevState => ({
        lines: prevState.lines.slice(0, prevState.lines.length - 1),
        fluidLines: prevState.fluidLines.slice(0, prevState.fluidLines.length - 1),
        editMode: prevState.fluidLines.length - 1 < this.props.maxLines
      }));
    } else if(this.lastObjectType === PixelLine) {
      this.setState(prevState => ({
        lines: prevState.lines.slice(0, prevState.lines.length - 1),
        pixelLines: prevState.pixelLines.slice(0, prevState.pixelLines.length - 1),
        editMode: prevState.pixelLines.length - 1 < this.props.maxLines
      }));
    }
  }

  // Undo all drawings and transformations 
  public undoAll = () => {
    this.lastObjectType = null;
    this.setState({
      lines: [],
      fluidLines: [],
      pixelLines: [],
      editMode: true
    });
    this.ctx?.restore();
    this.ctx?.save();
    this.redraw();
  }

  /**************************************** Canvas transforms ****************************************/
  // Transform point from normal coordinates to transformed coordinates
  private transformPoint = (p: Point): Point => {
    return (this.ctx as any).transformedPoint(p);
  }

  // Zoom-in/out as a function of the input magnitude
  private zoom = (magnitude: number) => {
    let pt = this.transformPoint(this.endPoint);
    this.ctx?.translate(pt.x, pt.y);

    // Compute the zoom factor as a function of the number of clicks 
    let factor = Math.pow(Canvas.scaleFactor, magnitude);
    // Prevent the total zoom factor from being less than Canvas.maxZoomOut
    if(this.zoomFactor * factor < Canvas.maxZoomOut) factor = Canvas.maxZoomOut / this.zoomFactor;
    this.zoomFactor *= factor;
    this.ctx?.scale(factor, factor);
    this.ctx?.translate(-pt.x, -pt.y);
    this.redraw();
  }

  // Reassign the CanvasRenderingContext2D transformations, allowing them to be tracked by the component
  private trackTransforms = () => {
    // Return the current transformation matrix
    (this.ctx as CanvasRenderingContext2D).getTransform = () => { return this.xform; }

    // Save the current state of the canvas and the last transformation
    var save = (this.ctx as CanvasRenderingContext2D).save;
    (this.ctx as CanvasRenderingContext2D).save = () => {
      this.savedTransforms.push(this.xform.translate(0, 0));
      return save.call(this.ctx);
    }

    // Restore the previous state of the canvas and pop the last transformation
    var restore = (this.ctx as CanvasRenderingContext2D).restore;
    (this.ctx as CanvasRenderingContext2D).restore = () => {
      this.xform = (this.savedTransforms.pop() as DOMMatrix);
      return restore.call(this.ctx);
    }

    // Reset all canvas transformations
    (this.ctx as any).resetTransforms = () => {
      this.xform = this.savedTransforms[0];
      this.savedTransforms = [];
      return;
    }

    // Add scaling to the SVG transformation matrix
    var scale = (this.ctx as CanvasRenderingContext2D).scale;
    (this.ctx as CanvasRenderingContext2D).scale = (scaleX, scaleY) => {
      this.xform = this.xform.scale(scaleX, scaleY);
      return scale.call(this.ctx, scaleX, scaleY);
    }

    // Add rotation to the SVG transformation matrix
    var rotate = (this.ctx as CanvasRenderingContext2D).rotate;
    (this.ctx as CanvasRenderingContext2D).rotate = (radians) => {
      this.xform = this.xform.rotate(radians * 180 / Math.PI);
      return rotate.call(this.ctx, radians);
    }

    // Add translation to the SVG transformation matrix
    var translate = (this.ctx as CanvasRenderingContext2D).translate;
    (this.ctx as CanvasRenderingContext2D).translate = (dx, dy) => {
      this.xform = this.xform.translate(dx, dy);
      return translate.call(this.ctx, dx, dy);
    }

    // Apply the current transformation matrix - xform
    var transform = (this.ctx as CanvasRenderingContext2D).transform;
    (this.ctx as CanvasRenderingContext2D).transform = (a, b, c, d, e, f) => {
      var m2 = this.svg.createSVGMatrix();
      m2.a = a; m2.b = b; m2.c = c; m2.d = d; m2.e = e; m2.f = f;
      this.xform = this.xform.multiply(m2);
      return transform.call(this.ctx, a, b, c, d, e, f);
    }

    // Set the current SVG transformation matrix
    var setTransform = (this.ctx as CanvasRenderingContext2D).setTransform;
    ((this.ctx as CanvasRenderingContext2D).setTransform as (a: number, b: number, c: number, d: number, e: number, f: number) => void) 
      = (a: number, b: number, c: number, d: number, e: number, f: number) => {
      this.xform.a = a; this.xform.b = b; this.xform.c = c;
      this.xform.d = d; this.xform.e = e; this.xform.f = f; 
      return (setTransform as any).call(this.ctx, a, b, c, d, e, f);
    }

    // Transform a point to the current reference frame
    (this.ctx as any).transformedPoint = (point: Point): DOMPoint => {
      let svgPoint = this.svg.createSVGPoint();
      svgPoint.x = point.x; svgPoint.y = point.y;
      return svgPoint.matrixTransform(this.xform.inverse());
    }
  }

  /***************************************** Render method *******************************************/
  public render = (): JSX.Element => {
    return (
      <div>
        <div>
          <canvas 
            ref={this.canvasRef} 
            height={this.state.height} 
            width={this.state.width} 
            onMouseDown={this.handleMouseDown}
            onMouseUp={this.handleMouseUp}
            onMouseLeave={this.handleMouseLeave}
            onMouseMove={this.handleMouseMove}
          >
          </canvas>
        </div>
        <div>
          <FormControlLabel label="Edit" control={
              <Switch onChange={this.toggleEdit} checked={this.state.editMode} inputProps={{ 'aria-label': 'controlled' }}/>
          }></FormControlLabel>
          <IconButton color="primary" component="span" onClick={this.undoAll}><ClearIcon/></IconButton>
          <IconButton color="primary" component="span" onClick={this.undoLast}><UndoIcon/></IconButton>
          <Button onClick={this.downloadImage}>Download</Button>
          {// Print line diameters
            this.state.lines.length !== 0 &&
              this.state.lines.map((line, index) => <p key={"line" + index}>{Math.round(line.length*100)/100}</p>)
          }
          {// Print diameter stenosis
            this.state.lines.length === this.props.maxLines &&
              <p>Diameter stenosis percentage: {Math.round(this.computeDiameterStenosisPercentage() as number * 100) / 100}%</p>            
          }
          {// Print area stenosis
            this.state.lines.length === this.props.maxLines &&
              <p>Area stenosis percentage: {Math.round(this.computeAreaStenosisPercentage() as number * 100) / 100}%</p>            
          }
        </div>
      </div>
    );
  }
}

export default Canvas;