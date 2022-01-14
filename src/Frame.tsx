import React from "react";
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Slider from '@mui/material/Slider';
import Button from '@mui/material/Button'; 
import { IconButton } from "@mui/material";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { saveAs } from "file-saver";
import { Canvas } from './Canvas/Canvas'
import { PixelLine } from "./Canvas/PixelLine";
import { FluidLine } from "./Canvas/FluidLine";

// FIXME known issues: when the brightness is changed, two image updates are triggered and a mask update is triggered, even though it wasn't supposed to,
// slowing down the rendering

export type FrameProps = {
  imageFile: File | null,                                                       // File containing the image
  maskFile: File | null,                                                        // File containing the mask
  name: string                                                                  // Name of the image, or mask, if the image is absent
}
type FrameState = {
  image: HTMLImageElement | null,                                               // HTMLImageElement with the image
  mask: HTMLImageElement | null,                                                // HTMLImageElement with the mask
  imageName: string,                                                            // Name of the image
  maskName: string,                                                             // Name of the mask

  // Patient/frame info
  patientID: number,                                                            // ID of the patient
  primaryAngle: number,                                                         // Frame primary acquisition angle
  secondaryAngle: number,                                                       // Frame secondary acquisition angle
  frameNumber: number,                                                          // Number of the frame

  // Image display info
  brightness: number,                                                           // Canvas brightness
  contrast: number                                                              // Canvas contrast
}

export class Frame extends React.Component<FrameProps, FrameState> {
  // Class properties
  private static suffix: string = 'd';                                          // Mask suffix
  private static maskRegExp: RegExp = new RegExp('([A-Z]|[a-z])+.png$');        // Regex expression to test mask suffix and extension, of form <letter>.png
  private static maxLines = 3;                                                  // Maximum lines to be drawn in the canvas
  private static sliderTimeout = 0;                                             // Timeout before executing slider update function

  // Instance properties
  private imageCanvas: React.RefObject<Canvas>;                                 // Reference to the image canvas       
  private maskCanvas: React.RefObject<Canvas>;                                  // Reference to the mask canvas

  private brightnessTimeoutID: NodeJS.Timeout | null = null;                    // ID for the brightness update timeout
  private contrastTimeoutID: NodeJS.Timeout | null = null;                      // ID for the contrast update timeout

  constructor(props: FrameProps) {
    super(props);

    // Determine the names of the image and mask
    let imageName: string, maskName: string;
    if(Frame.testMaskRegex(this.props.name)) {
      imageName = Frame.maskNameToImageName(this.props.name);
      maskName = this.props.name;
    } else {
      imageName = this.props.name;
      maskName = Frame.imageNameToMaskName(this.props.name);
    }

    // Create references to the image and mask canvases
    this.imageCanvas = React.createRef();
    this.maskCanvas = React.createRef();

    // Create an image object from the url
    let image: HTMLImageElement | null;
    if (this.props.imageFile) {
      image = new Image();
      image.id = imageName;
      image.src = URL.createObjectURL(this.props.imageFile);
    } else image = null;

    // Create a mask object from the url
    let mask: HTMLImageElement | null;
    if (this.props.maskFile) {
      mask = new Image();
      mask.id = maskName;
      mask.src = URL.createObjectURL(this.props.maskFile);
    } else mask = null;

    // Initialize the frame state
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
      brightness: Canvas.defaultBrightness,
      contrast: Canvas.defaultContrast
    }
  }

  // Getters
  public get imageURL(): string { return this.imageCanvas.current ? this.imageCanvas.current.getDownloadURL() : "" }
  public get maskURL(): string { return this.maskCanvas.current ? this.maskCanvas.current.getDownloadURL() : "" }
  public get imageName(): string { return this.state.imageName ? this.state.imageName : "image.png" }
  public get maskName(): string { return this.state.maskName ? this.state.maskName : "mask.png" }
  public static get maskSuffix(): string { return Frame.suffix }

  // Setters
  public static set maskSuffix(suffix: string) { Frame.suffix = suffix }

  /*********************************** Filename derivation methods ***********************************/
  // Converts the name of a given mask to the name of the corresponding image
  public static maskNameToImageName(name: string): string {
    return name.replace(Frame.suffix + '.png', '.png');
  }

  // Converts the name of a given image to the name of the corresponding mask
  public static imageNameToMaskName(name: string): string {
    return name.replace('.png', Frame.suffix + '.png');
  }

  // Tests whether a filename corresponds to that of a mask or not
  public static testMaskRegex(filename: string): boolean {
    return Frame.maskRegExp.test(filename);
  }

  /************************************ Line propagation methods *************************************/
  // Propagate annotation lines from image to mask
  public propagateLinesToMask = () => {
    let imageCanvas = this.imageCanvas.current, maskCanvas = this.maskCanvas.current;
    // If either canvas is not defined, the image canvas does not have enough lines, or the mask canvas has lines already, return
    if(!imageCanvas || !maskCanvas || imageCanvas.lines.length !== Frame.maxLines || maskCanvas.lines.length !== 0) return;
    let rows = maskCanvas.height

    // If the mask data is null or undefined, return. Else, assign it and continue
    if(!maskCanvas.getOriginalImageData()) return;
    else var mask = maskCanvas.getOriginalImageData() as Uint8ClampedArray;
    
    // Undo all the transformations applied to the mask, including zoom and pan, before drawing the lines
    maskCanvas.undoAll();

    // Iterate over all the lines in the image
    imageCanvas.lines.forEach(line => {

      // Compute the slope of the line
      let slope: [number, number];
      let deltaX = line.endX - line.startX, deltaY = line.endY - line.startY;
      if(Math.abs(deltaX) > Math.abs(deltaY)) slope = deltaX > 0 ? [1, deltaY/Math.abs(deltaX)] : [-1, deltaY/Math.abs(deltaX)];
      else slope = deltaY > 0 ? [deltaX/Math.abs(deltaY), 1] : [deltaX/Math.abs(deltaY), -1];

      // Compute the coordinates and rounded coordinates of the current position
      let row = line.startX, col = line.startY, index;
      let roundedRow = Math.round(row), roundedCol = Math.round(col); 

      // Set the initial values of the coordinates of the line in the mask
      let maskStartX = 0, maskStartY = 0, maskEndX = 0, maskEndY = 0;

      // Denotes whether the begining of the line in the mask has been determined yet or not
      let start = false;

      // Iterate over the line points, to find where the line starts and ends in the mask
      while((deltaX > 0 ? row <= line.endX : row >= line.endX) && (deltaY > 0 ? col <= line.endY : col >= line.endY)) {

        // Compute the point's index in the buffer
        index = roundedCol*rows*4 + roundedRow*4;

        // Check the value of the pixel where we're at
        if(mask[index] === 255 && mask[index+1] === 255 && mask[index+2] === 255 && mask[index+3] === 255) {
          // If we are over an artery and haven't started the line yet, we start it. Else, we update its end point
          if(start === false) {
            start = true;
            maskStartY = col; maskStartX = row;
            maskEndY = col; maskEndX = row;
          } else maskEndY = col; maskEndX = row;
        } 
        // If we are over background and have already started the line, we break the cycle
        else if(mask[index] === 0 && mask[index+1] === 0 && mask[index+2] === 0 && mask[index+3] === 255 && start === true) break;
          
        // Go to the next position
        row += slope[0]; col += slope[1];
        roundedRow = Math.round(row); roundedCol = Math.round(col);
      }      

      // Add the line to the mask as a pixel line and draw it
      this.maskCanvas.current?.addPixelLine(new PixelLine({x: maskStartX, y: maskStartY}, {x: maskEndX, y: maskEndY}));
    })
  }

  // Propagate annotation lines from image to mask
  public propagateLinesToImage = () => {
    let imageCanvas = this.imageCanvas.current, maskCanvas = this.maskCanvas.current;

    // If either the image or mask canvas is not defined, return
    if(!imageCanvas || !maskCanvas) return;

    // Retrieve the lines in the mask canvas and check if they are enough
    let lines = maskCanvas.lines;
    if(lines.length !== Frame.maxLines) return;

    // Undo all transformations to the image canvas, including scaling and lines draw
    imageCanvas.undoAll();

    // For each line in the mask, add a fluid line to the  
    lines.forEach(line => { this.imageCanvas.current?.addFluidLine(new FluidLine(line.startPoint, line.endPoint)) });
  }

  /************************************** Canvas filter methods **************************************/
  // Update the brightness in the slider and in the image canvas component
  private handleBrightnessChange = (event: Event, value: number | number[]) => {
    if(typeof value === "number") {
      if(this.imageCanvas.current) var image = this.imageCanvas.current;
      else return;

      // If there is a timeout, cancel its execution
      if(this.brightnessTimeoutID !== null) clearTimeout(this.brightnessTimeoutID);
    
      // Change the brightness after a predefined timeout
      this.brightnessTimeoutID = setTimeout(() => {
        image.brightness = value;
        this.setState({ brightness: value });
      }, Frame.sliderTimeout);
    }
  }

  // Update the contrast in the slider and in the image canvas component
  private handleContrastChange = (event: Event, value: number | number[]) => {
    if(typeof value === "number") {
      if(this.imageCanvas.current) var image: Canvas = this.imageCanvas.current;
      else return;

      // If there is a timeout, cancel its execution
      if(this.contrastTimeoutID !== null) clearTimeout(this.contrastTimeoutID);
    
      // Change the brightness after a predefined timeout
      this.contrastTimeoutID = setTimeout(() => {
        image.contrast = value;
        this.setState({ contrast: value });
      }, Frame.sliderTimeout);
    }
  }

  // Reset the brightness and contrast filters to their default values
  private resetFilters = () => {
    this.setState({brightness: Canvas.defaultBrightness, contrast: Canvas.defaultContrast});
    this.imageCanvas.current?.setFilters(Canvas.defaultBrightness, Canvas.defaultContrast);
  }

  /**************************************** Download methods *****************************************/
  // Download the annotated image png
  public downloadImage() {
    let imageURL = this.imageCanvas.current?.getDownloadURL();
    if(imageURL) saveAs(imageURL, this.state.imageName.replace('.png', '_qca.png'));
  }

  // Download the annotated mask png
  public downloadMask() {
    let maskURL = this.maskCanvas.current?.getDownloadURL();
    if(maskURL) saveAs(maskURL, this.state.maskName.replace('.png', '_qca.png'));
  }

  // Download the annotated image and mask pngs
  public downloadImageAndMask() {
    this.downloadImage();
    this.downloadMask();
  }

  // Convert the information associated to the frame into an array of the form [[image_info], [mask_info]]
  public getSpreadsheetRow = (): (string | number)[][] => {
    let image = this.imageCanvas.current, mask = this.maskCanvas.current;
    let imageDiameters: (number | string)[] = [], maskDiameters: (number | string)[] = [];
    let imageDiameterStenosis, imageAreaStenosis, maskDiameterStenosis, maskAreaStenosis;

    // Compute the diameters of the lines in the image and mask
    if(image) image.lines.forEach(line => imageDiameters.push(line.length));
    if(mask) mask.lines.forEach(line => maskDiameters.push(line.length));

    // If there are enough lines, determine the diameter and area stenosis in the image
    if(imageDiameters.length === Frame.maxLines) {
      imageDiameterStenosis = (image?.computeDiameterStenosisPercentage() as number)/100;
      imageAreaStenosis = (image?.computeAreaStenosisPercentage() as number)/100;
    } else {
      imageDiameterStenosis = "NaN";
      imageAreaStenosis = "NaN";
      while(imageDiameters.length < Frame.maxLines) imageDiameters.push('NaN');
    }

    // If there are enough lines, determine the diameter and area stenosis in the mask
    if(maskDiameters.length === Frame.maxLines) {
      maskDiameterStenosis = (mask?.computeDiameterStenosisPercentage() as number)/100;
      maskAreaStenosis = (mask?.computeAreaStenosisPercentage() as number)/100;
    } else {
      maskDiameterStenosis = "NaN";
      maskAreaStenosis = "NaN";
      while(maskDiameters.length < Frame.maxLines) maskDiameters.push('NaN');
    }

    // Return the info as an array of arrays
    let data = [
      [this.state.patientID, this.state.primaryAngle, this.state.secondaryAngle, this.state.frameNumber, 'Image', ...imageDiameters, imageDiameterStenosis, imageAreaStenosis],
      [this.state.patientID, this.state.primaryAngle, this.state.secondaryAngle, this.state.frameNumber, 'Mask', ...maskDiameters, maskDiameterStenosis, maskAreaStenosis]
    ]
    return data;
  }

  /***************************************** Render method *******************************************/
  public render(): JSX.Element {
    return (
      <Grid container rowSpacing={1} columnGap={0} key={this.state.imageName}>
        <Grid item xs={3} sm={3} md={3} display="flex" flexDirection="column" textAlign="center" alignItems="center" justifyContent="center">
          <p>Patient ID: { this.state.patientID }</p>
          <p>Primary Angle: { this.state.primaryAngle }º</p>
          <p>Secondary Angle: { this.state.secondaryAngle }º</p>
          <p>Frame Number: { this.state.frameNumber }</p>
          <Box sx={{ width: "60%" }}>
            Brightness
            <Slider 
              defaultValue={Canvas.defaultBrightness} 
              step={1} 
              min={Canvas.minBrightness} 
              max={Canvas.maxBrightness}
              value={this.state.brightness}                
              aria-label="Brightness" 
              valueLabelDisplay="auto" 
              onChange={this.handleBrightnessChange}/>
          </Box>
          <Box sx={{ width: "60%" }}>
            Contrast
            <Slider 
              defaultValue={Canvas.defaultContrast} 
              step={1} 
              min={Canvas.minContrast} 
              max={Canvas.maxContrast}
              value={this.state.contrast} 
              aria-label="Contrast" 
              valueLabelDisplay="auto" 
              onChange={this.handleContrastChange}/>
          </Box>
          <Button onClick={this.resetFilters}>Reset</Button>
        </Grid>

        {// Image canvas
          this.state.image ?
            <Grid item classes={{ root: "item" }} xs={3} sm={3} md={3}>
                <Canvas ref={this.imageCanvas} backgroundImage={this.state.image} maxLines={Frame.maxLines}></Canvas>
            </Grid>
          :
            <Grid item classes={{ root: "item" }} xs={3} sm={3} md={3}>
              <p>No matching image for mask {this.state.maskName}</p>
            </Grid>  
        }

        {/* Line propagation buttons */}
        <Grid item classes={{ root: "arrowItem" }} xs={1} sm={1} md={1}>
          <div>
            <div><IconButton color="primary" component="span" onClick={this.propagateLinesToMask}><ArrowForwardIcon/></IconButton></div>
            <div><IconButton color="primary" component="span" onClick={this.propagateLinesToImage}><ArrowBackIcon/></IconButton></div>
          </div>
        </Grid>

        {// Mask canvas
          this.state.mask ?
            <Grid item classes={{ root: "item" }} xs={3} sm={3} md={3}>
              <Canvas ref={this.maskCanvas} backgroundImage={this.state.mask} maxLines={Frame.maxLines}></Canvas>
            </Grid>
          :
            <Grid item classes={{ root: "item" }} xs={3} sm={3} md={3}>
              <p>No matching mask for image {this.state.imageName}</p>
            </Grid>
        }
      </Grid>
    );
  }
}

export default Frame;