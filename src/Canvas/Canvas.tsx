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

// Canvas state and props
export type CanvasProps = {
  backgroundImage: HTMLImageElement,  // URL of the initial background image  
  maxLines: number,                   // Maximum number of lines to be drawn
  brightness: number,                 // Image brightness
  contrast: number                    // Image contrast
}
type CanvasState = {
  height: number,                     // Height of the canvas
  width: number,                      // Width of the canvas
  pixelLines: PixelLine[],            // Pixelated lines to be plotted in the canvas
  lines: FluidLine[],                 // Fluid lines to be plotted in the canvas
  editMode: boolean                   // Whether canvas edition is enabled or not
}

export class Canvas extends React.Component<CanvasProps, CanvasState> {
  // Default scale factor, line width and line color
  private static scaleFactor: number = 1.1;         
  private static lineWidth: number = 1;
  private static lineColor: string = '#00FF00';

  // SVG library FIXME do i need it?
  private svg = document.createElementNS("http://www.w3.org/2000/svg",'svg');  

  // Current and previous transformation matrices
  private xform: DOMMatrix = this.svg.createSVGMatrix();                       
  private savedTransforms: DOMMatrix[] = [];      
  
  // Start and end mouse click positions
  private startPoint: Point = { x: 0, y: 0 }
  private endPoint: Point = { x: 0, y: 0 }

  // Canvas reference, rendering context and state
  private canvasRef: React.RefObject<HTMLCanvasElement>;
  private ctx: CanvasRenderingContext2D | null = null;
  state: CanvasState = { height: 512, width: 512, lines: [], editMode: true, pixelLines: []};

  // User-interaction state
  private mouseIsDown: boolean = false;     // Indicates whether the mouse is currently down
  private dragStart: Point | null = null;   // Point where the user started dragging or null
  private dragged: boolean = true;          // Indicates whether the user has finished dragging or not
  private zoomFactor: number = 1;           // Current zoom factor
  private lastObjectType: typeof FluidLine | typeof PixelLine | null = null;   // Indicates the type last object added by the user, allowing to undo operation.
  
  // Image data extracted from the canvas' background image
  private originalImageData: ImageData | undefined | null = null;
  //private updatedImageData: ImageData | undefined | null = null;
  private promiseNumber: number = 0;        // Promises counter

  // Image filters
  private _brightness: number;
  private _contrast: number;

  // Creates a reference to the canvas and sets the initial state
  constructor(props: CanvasProps) {
    super(props);
    this._brightness = this.props.brightness;
    this._contrast = this.props.contrast;
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

  // Before the component umnounts, remove the wheel event listener
  componentWillUnmount() {
    this.canvasRef.current?.removeEventListener('wheel', this.handleScroll, { passive: false} as EventListenerOptions);
  }

  componentDidUpdate() {
    this._contrast = this.props.contrast;
    this._brightness = this.props.brightness;
    this.redraw();
  }

  // Returns a clone of the the image data object, preventing the image from being tampered with outside this class
  public getOriginalImageData(): Uint8ClampedArray | undefined | null { return this.originalImageData?.data.map((x) => x); }
  public getLines(): FluidLine[] { return this.state.lines; }
  public getPixelLines(): PixelLine[] { return this.state.pixelLines; }
  public getHeight(): number { return this.state.height }
  public getWidth(): number { return this.state.width }


  public get brightness() { return this._brightness }
  public get contrast() { return this._contrast }
  
  public set brightness(brightness: number) {
    this._brightness = brightness;
    this.redraw();
  }
  public set contrast(contrast: number) {
    this._contrast = contrast;
    this.redraw();
  }

  // Sets the brightness and contrast filte values
  public setFilters(brightness: number, contrast: number ) {
    this.contrast = contrast;
    this.brightness = brightness;
    this.redraw();
  }


  // Add a line to the canvas
  public addLine = (line: FluidLine, save: boolean = true) => {
    if(this.state.lines.length < this.props.maxLines) {
      this.lastObjectType = FluidLine;
      line.draw(this.ctx as CanvasRenderingContext2D);
      if(save) {
        this.setState(prevState => ({
          lines: [...prevState.lines, line],
          editMode: this.state.editMode && prevState.lines.length + 1 < this.props.maxLines
        }));
      }
    }
  }

  // Add a pixel line to the canvas
  public addPixelLine = (pixelLine: PixelLine, save: boolean = true) => {
    if(this.state.pixelLines.length < this.props.maxLines) {
      this.lastObjectType = PixelLine;
      pixelLine.draw(this.ctx as CanvasRenderingContext2D);
      if(save) {
        this.setState(prevState => ({
          pixelLines: [...prevState.pixelLines, pixelLine],
          editMode: this.state.editMode && prevState.pixelLines.length + 1 < this.props.maxLines
        }));
      }
    }
  }



  // Given the three drawn lines or pixel lines, computes the associated diameter stenosis percentage
  public computeDiameterStenosisPercentage = () => {
    var lengthsArray: number[] = [];
    if(this.state.lines.length !== this.props.maxLines && this.state.pixelLines.length !== this.props.maxLines) return undefined;
    else if(this.state.lines.length === this.props.maxLines) {
      lengthsArray = this.state.lines.map((line) => { return line.length; });
    } else if(this.state.pixelLines.length === this.props.maxLines) {
      lengthsArray = this.state.pixelLines.map((pixelLine) => { return pixelLine.length; });
    }
    lengthsArray = lengthsArray.sort((a, b) => a - b);
    return 2 * lengthsArray[0] / (lengthsArray[1] + lengthsArray[2]) * 100;
  }

  // Given the three drawn lines or pixel lines, computes the associated area stenosis percentage
  public computeAreaStenosisPercentage = () => {
    var lengthsArray: number[] = [];
    if(this.state.lines.length !== this.props.maxLines && this.state.pixelLines.length !== this.props.maxLines) return undefined;
    else if(this.state.lines.length === this.props.maxLines) {
      lengthsArray = this.state.lines.map((line) => { return line.length; });
    } else if(this.state.pixelLines.length === this.props.maxLines) {
      lengthsArray = this.state.pixelLines.map((pixelLine) => { return pixelLine.length; });
    }
    lengthsArray = lengthsArray.sort((a, b) => a - b);
    return 2 * Math.PI * Math.pow(0.5*lengthsArray[0], 2) / ( Math.PI * Math.pow(0.5*lengthsArray[1], 2) + Math.PI * Math.pow(0.5*lengthsArray[2], 2)) * 100;
  }

  // Clear the canvas, redraw all its elements, and update the image data object
  private redraw = () => {
    this.clearCanvas();
    this.ctx?.drawImage(this.props.backgroundImage, 0, 0);
    let brightnessFilter = "brightness(" + this.brightness + "%)";
    let contrastFilter = "contrast(" + this.contrast + "%)";
    (this.ctx as CanvasRenderingContext2D).filter = brightnessFilter + contrastFilter;
    this.state.lines.forEach((line) => line.draw(this.ctx as CanvasRenderingContext2D));
    this.state.pixelLines.forEach((pixelLine) => pixelLine.draw(this.ctx as CanvasRenderingContext2D));
  }

  // Get the (x, y) position of MouseEvent e
  private getMouseEventPosition = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>): Point => {
    return {
      x: e.pageX - (e.target as HTMLCanvasElement).offsetLeft,
      y: e.pageY - (e.target as HTMLCanvasElement).offsetTop
    };
  }

  // Transform point from page coordinates to canvas coordinates
  private transformPoint = (p: Point): Point => {
    return (this.ctx as any).transformedPoint(p);
  }

  // Clear the entire canvas
  private clearCanvas = () => {
    let p1 = this.transformPoint({x: 0, y: 0});
    let p2 = this.transformPoint({x: this.canvasRef.current?.width as number, y: this.canvasRef.current?.height as number});
    this.ctx?.clearRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
  }

  public getDownloadURL = (): string => {
    this.ctx?.restore();
    this.ctx?.save();
    this.clearCanvas();
    this.ctx?.putImageData(this.originalImageData as ImageData, 0, 0);
    this.state.lines.forEach((line) => line.draw(this.ctx as CanvasRenderingContext2D));
    this.state.pixelLines.forEach((pixelLine) => pixelLine.draw(this.ctx as CanvasRenderingContext2D));
    return this.canvasRef.current ? this.canvasRef.current.toDataURL("image/png") : "";
  }

  private downloadImage = () => {
    this.ctx?.restore();
    this.ctx?.save();
    this.clearCanvas();
    this.ctx?.putImageData(this.originalImageData as ImageData, 0, 0);
    this.state.lines.forEach((line) => line.draw(this.ctx as CanvasRenderingContext2D));
    this.state.pixelLines.forEach((pixelLine) => pixelLine.draw(this.ctx as CanvasRenderingContext2D));
    saveAs(this.canvasRef.current?.toDataURL("image/png") as string, 'file.png');
  }

  // If the program is in editting mode, start drawing a line. Otherwise, start a drag
  private handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
    this.startPoint = this.getMouseEventPosition(e);
    
    if(this.state.editMode && this.state.lines.length < this.props.maxLines) {
      this.mouseIsDown = true;
    } else {
      this.dragStart = this.transformPoint(this.startPoint);
      this.dragged = false;
    }
  }

  // If the program is in edit mode and the mouse is down, draw a line and put the mouse up
  private handleMouseLeave = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {  
    this.dragged = true;  
    this.dragStart = null;
    if(this.state.editMode && this.mouseIsDown && this.state.lines.length < this.props.maxLines) {
      this.mouseIsDown = false;
      this.addLine(new FluidLine(this.transformPoint(this.startPoint), this.transformPoint(this.endPoint)));
      this.setState({ editMode: this.state.editMode && this.state.lines.length < this.props.maxLines});
    }
  }

  // If the program is in edit mode and the mouse was down, draw a line. If the program was not in edit mode,
  // and the image had not been dragged, zoom
  private handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
    this.endPoint = this.getMouseEventPosition(e);

    if(this.state.editMode && this.state.lines.length < this.props.maxLines) {
      if(this.mouseIsDown) {
        let lastPt = this.transformPoint(this.endPoint);
        this.mouseIsDown = false;
        this.addLine(new FluidLine(this.transformPoint(this.startPoint), lastPt));
      }
    } else {
      this.dragStart = null;
      if(!this.dragged) this.zoom(e.shiftKey ? -1 : 1);
    }
  }

  private handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
    this.endPoint = this.getMouseEventPosition(e);
    if(this.state.editMode && this.state.lines.length < this.props.maxLines) {
      if(this.mouseIsDown) {
        this.redraw();
        new FluidLine(this.transformPoint(this.startPoint), this.transformPoint(this.endPoint)).draw(this.ctx as CanvasRenderingContext2D);
      }
    } else {
      this.dragged = true;
      if(this.dragStart) {
        let pt = this.transformPoint(this.endPoint);
        this.ctx?.translate(pt.x - this.dragStart.x, pt.y - this.dragStart.y);
        this.redraw();
      }
    }
  }

  // Zoom-in/out as a function of the number of clicks
  private zoom = (clicks: number) => {
    let pt = this.transformPoint(this.endPoint);
    this.ctx?.translate(pt.x, pt.y);

    // Compute the zoom factor as a function of the number of clicks 
    let factor = Math.pow(Canvas.scaleFactor, clicks);
    // Prevent the total zoom factor from being less than 1
    if(this.zoomFactor * factor < 1) factor = 1 / this.zoomFactor;
    this.zoomFactor *= factor;
    this.ctx?.scale(factor, factor);
    this.ctx?.translate(-pt.x, -pt.y);
    this.redraw();
  }
  
  // Zoom based on the scroll length and direction
  private handleScroll = (e: any) => {
    e.preventDefault(); //e.stopPropagation();
    let delta = e.deltaY ? - e.deltaY/40 : e.detail ? e.detail : 0;
    if(delta) this.zoom(delta);
  }

  private handleChange = () => {
    this.setState({editMode: !this.state.editMode && this.state.lines.length < this.props.maxLines});
  }

  private handleUndo = () => {
    if(this.lastObjectType === FluidLine && this.state.lines.length !== 0) {
      this.setState(prevState => ({
        lines: prevState.lines.slice(0, prevState.lines.length - 1),
        editMode: prevState.lines.length - 1 < this.props.maxLines
      }));
    } else if(this.lastObjectType === PixelLine && this.state.pixelLines.length !== 0) {
      this.setState(prevState => ({
        pixelLines: prevState.pixelLines.slice(0, prevState.pixelLines.length - 1),
        editMode: prevState.pixelLines.length - 1 < this.props.maxLines
      }));
    }
  }

  // Undo all drawings 
  public undoAll = () => {
    this.setState({
      lines: [],
      pixelLines: [],
      editMode: true
    });
    this.ctx?.restore();
    this.ctx?.save();
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

  public render(): JSX.Element {
    return (
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
        <br></br>
        <FormControlLabel 
          label="Edit" 
          control={
            <Switch 
              onChange={this.handleChange} 
              checked={this.state.editMode} 
              inputProps={{ 'aria-label': 'controlled' }}
        />}></FormControlLabel>
        <IconButton color="primary" component="span" onClick={this.undoAll}><ClearIcon/></IconButton>
        <IconButton color="primary" component="span" onClick={this.handleUndo}><UndoIcon/></IconButton>
        {
          this.state.lines && this.state.pixelLines.length === 0 &&
            this.state.lines.map((line, index) => {
              return (  
                <p key={"line" + index}>{Math.round(line.length*100)/100}</p>
              );
            })  
        }
        {
          this.state.lines.length === this.props.maxLines && this.state.pixelLines.length === 0 &&
            <p>Diameter stenosis percentage: {Math.round(this.computeDiameterStenosisPercentage() as number * 100) / 100}%</p>
        }
        {
          this.state.lines.length === this.props.maxLines && this.state.pixelLines.length === 0 &&
            <p>Area stenosis percentage: {Math.round(this.computeAreaStenosisPercentage() as number * 100) / 100}%</p>
        }
        {
          this.state.pixelLines && this.state.lines.length === 0 &&
            this.state.pixelLines.map((pixelLine, index) => {
              return (  
                <p key={"pixelLine" + index}>{Math.round(pixelLine.length*100)/100}</p>
              );
            })  
        }
        {
          this.state.pixelLines.length === this.props.maxLines && this.state.lines.length === 0 &&
            <p>Diameter stenosis percentage: {Math.round(this.computeDiameterStenosisPercentage() as number * 100) / 100}%</p>
        }
        {
          this.state.pixelLines.length === this.props.maxLines && this.state.lines.length === 0 &&
            <p>Area stenosis percentage: {Math.round(this.computeAreaStenosisPercentage() as number * 100) / 100}%</p>
        }
        <Button onClick={this.downloadImage}>Download</Button>
      </div>
    );
  }
}

export default Canvas;