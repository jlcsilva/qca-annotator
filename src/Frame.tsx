import React from "react";
import Grid from '@mui/material/Grid';
import { Canvas, Line, PixelLine } from './Canvas'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { IconButton } from "@mui/material";
import Slider from '@mui/material/Slider';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button'; 

export type FrameProps = {
  imageFile: File | null,
  maskFile: File | null,
  name: string
}

type FrameState = {
  image: HTMLImageElement | null,
  mask: HTMLImageElement | null,
  imageName: string,
  maskName: string,

  // Patient/frame info
  patientID: number,
  primaryAngle: number,
  secondaryAngle: number,
  frameNumber: number,

  // Image display info
  brightness: number,
  contrast: number
}

export class Frame extends React.Component<FrameProps, FrameState> {
  private static suffix: string = 'a';
  private static maskRegExp: RegExp = new RegExp('([A-Z]|[a-z])+.png$');
  private static maxLines = 3;
  private static defaultBrightness = 100;
  private static defaultContrast = 100;
  private imageCanvas: React.RefObject<Canvas>;
  private maskCanvas: React.RefObject<Canvas>;

  constructor(props: FrameProps) {
    super(props);

    let imageName: string, maskName: string;
    this.imageCanvas = React.createRef();
    this.maskCanvas = React.createRef();

    // If the name matched the file pattern of a mask name, it is the mask's name.
    // Otherwise it is the image's name
    if(!Frame.testMaskRegex(this.props.name)) {
      imageName = Frame.maskNameToImageName(this.props.name);
      maskName = this.props.name;
    } else {
      imageName = this.props.name;
      maskName = Frame.imageNameToMaskName(this.props.name);
    }

    let image: HTMLImageElement | null;
    if (this.props.imageFile) {
      image = new Image();
      image.id = imageName;
      image.src = URL.createObjectURL(this.props.imageFile);
    } else image = null;

    let mask: HTMLImageElement | null;
    if (this.props.maskFile) {
      mask = new Image();
      mask.id = maskName;
      mask.src = URL.createObjectURL(this.props.maskFile);
    } else mask = null;

    let parts = imageName.split("_");
    this.state = {
      image: image,
      mask: mask,
      imageName: imageName,
      maskName: maskName,
      patientID: parseInt(parts[0]), 
      primaryAngle: parseFloat(parts[1]),
      secondaryAngle: parseFloat(parts[2]),
      frameNumber: parseInt(parts[3]),
      brightness: Frame.defaultBrightness,
      contrast: Frame.defaultContrast
    }
  }

  // Propagate annotation lines from image to mask
  public propagateLinesToMask = () => {
    let lines = this.imageCanvas.current?.getLines();
    let mask = this.maskCanvas.current?.getOriginalImageData() as Uint8ClampedArray;
    let rows = this.maskCanvas.current?.getHeight() as number, cols = this.maskCanvas.current?.getWidth() as number;

    // Check if there are enough lines and whether the rows and cols values are defined
    if(lines?.length !== 3 || !rows || !cols || !mask) return;    
    if(this.maskCanvas.current?.getLines().length === Frame.maxLines || this.maskCanvas.current?.getPixelLines().length === Frame.maxLines) return;
    this.maskCanvas.current?.undoAll();

    lines?.forEach(line => {
      let startX = line.getStartX(), endX = line.getEndX(), startY = line.getStartY(), endY = line.getEndY();
      let deltaX = endX - startX, deltaY = endY - startY;
      let slope: [number, number];
      
      // Compute the slope from the starting to the finishing point
      if(Math.abs(deltaX) > Math.abs(deltaY)) slope = deltaX > 0 ? [1, deltaY/Math.abs(deltaX)] : [-1, deltaY/Math.abs(deltaX)];
      else slope = deltaY > 0 ? [deltaX/Math.abs(deltaY), 1] : [deltaX/Math.abs(deltaY), -1];

      let row = startX, col = startY, index;
      let roundedRow = Math.round(row), roundedCol = Math.round(col); 
      let start = false;
      let maskStartX: number = 0, maskStartY: number = 0, maskEndX: number = 0, maskEndY: number = 0;
      while((deltaX > 0 ? row <= endX : row >= endX) && (deltaY > 0 ? col <= endY : col >= endY)) {
        index = roundedCol*rows*4 + roundedRow*4;
        if(mask[index] === 255 && mask[index+1] === 255 && mask[index+2] === 255 && mask[index+3] === 255) {
          if(start === false) {
            start = true;
            maskStartY = col; maskStartX = row;
            maskEndY = col; maskEndX = row;
          } else {
            maskEndY = col; maskEndX = row;
          }
        } else if(mask[index] === 0 && mask[index+1] === 0 && mask[index+2] === 0 && mask[index+3] === 255) {
          // If we are over background and have already started the line, we break the cycle
          if(start === true) break;
        }
        // Go to the next position
        row += slope[0]; col += slope[1];
        roundedRow = Math.round(row); roundedCol = Math.round(col);
      }      
      // Add the line to the mask and draw it
      this.maskCanvas.current?.addPixelLine(new PixelLine({x: maskStartX, y: maskStartY}, {x: maskEndX, y: maskEndY}));
    })
  }

  // Propagate annotation lines from image to mask
  public propagateLinesToImage = () => {
    let pixelLines = this.maskCanvas.current?.getPixelLines();
    // Check if there are enough lines  
    if(pixelLines?.length !== Frame.maxLines) return;
    pixelLines?.forEach(pixelLine => { this.imageCanvas.current?.addLine(new Line(pixelLine.getStartPoint(), pixelLine.getEndPoint()));});
  }

  // Converts the name of a given mask to the name of the corresponding image
  public static maskNameToImageName(name: string): string {
    return name.replace(Frame.suffix + '.png', '.png');
  }

  // Converts the name of a given image to the name of the corresponding mask
  public static imageNameToMaskName(name: string): string {
    return name.replace('.png', Frame.suffix + '.png');
  }

  // Test whether a filename corresponds to that of a mask or not
  public static testMaskRegex(filename: string): boolean {
    return Frame.maskRegExp.test(filename);
  }

  public static getMaskSuffix(): string {
    return Frame.suffix;
  }

  public static setMaskSuffix(suffix: string) {
    Frame.suffix = suffix;
  }

  
  private brightnessTimeoutID: any;
  private handleBrightnessChange = (event: Event, value: number | number[]) => {
    if(typeof value === "number") {
      // Timeout to ensure smooth dragging
      clearTimeout(this.brightnessTimeoutID)
      this.brightnessTimeoutID = setTimeout(() => {
        this.setState({brightness: value});
        this.imageCanvas.current?.setBrightness(value);
      }, 1)
    }
  }

  private contrastTimeoutID: any;
  private handleContrastChange = (event: Event, value: number | number[]) => {
    if(typeof value === "number") {
      // Timeout to ensure smooth dragging
      clearTimeout(this.brightnessTimeoutID)
      this.brightnessTimeoutID = setTimeout(() => {
        this.setState({contrast: value});
        this.imageCanvas.current?.setContrast(value);
      }, 1)
    }
  }

  private resetFilters = () => {
    this.setState({brightness: Frame.defaultBrightness, contrast: Frame.defaultContrast});
    this.imageCanvas.current?.setFilters(Frame.defaultBrightness, Frame.defaultContrast);
  }

  public render(): JSX.Element {
    return (
      <Grid container rowSpacing={1} columnGap={0} key={this.state.imageName}>
        <Grid item xs={2} sm={2} md={2} display="flex" flexDirection="column" textAlign="center" alignItems="center" justifyContent="center">
          <p>Patient ID: { this.state.patientID }</p>
          <p>Primary Angle: { this.state.primaryAngle }º</p>
          <p>Secondary Angle: { this.state.secondaryAngle }º</p>
          <p>Frame Number: { this.state.frameNumber }</p>
          <Box sx={{ width: "60%" }}>
            Brightness
            <Slider defaultValue={Frame.defaultBrightness} step={1} value={this.state.brightness} min={0} max={150} aria-label="Brightness" valueLabelDisplay="auto" onChange={this.handleBrightnessChange}/>
          </Box>
          <Box sx={{ width: "60%" }}>
            Contrast
            <Slider defaultValue={Frame.defaultContrast} step={1} value={this.state.contrast} min={0} max={1000} aria-label="Contrast" valueLabelDisplay="auto" onChange={this.handleContrastChange}/>
          </Box>
          <Button onClick={this.resetFilters}>Reset</Button>
        </Grid>
        {
          this.state.image ?
            <Grid item classes={{ root: "item" }} xs={4} sm={4} md={4}>
                <Canvas ref={this.imageCanvas} backgroundImage={this.state.image} maxLines={Frame.maxLines} brightness={this.state.brightness} contrast={this.state.contrast}></Canvas>
            </Grid>
          :
            <Grid item classes={{ root: "item" }} xs={4} sm={4} md={4}>
              <p>No matching image for mask {this.state.maskName}</p>
            </Grid>  
        }
        <Grid item classes={{ root: "arrowItem" }} xs={1} sm={1} md={1}>
          <div>
            <IconButton color="primary" component="span" onClick={this.propagateLinesToMask}><ArrowForwardIcon/></IconButton>
            <br></br>
            <IconButton color="primary" component="span" onClick={this.propagateLinesToImage}><ArrowBackIcon/></IconButton>
          </div>
        </Grid>
        {
          this.state.mask ?
            <Grid item classes={{ root: "item" }} xs={4} sm={4} md={4}>
              <Canvas ref={this.maskCanvas} backgroundImage={this.state.mask} maxLines={Frame.maxLines} brightness={Frame.defaultBrightness} contrast={Frame.defaultContrast}></Canvas>
            </Grid>
          :
            <Grid item classes={{ root: "item" }} xs={4} sm={4} md={4}>
              <p>No matching mask for image {this.state.imageName}</p>
            </Grid>
        }
      </Grid>
    );
  }
}

export default Frame;