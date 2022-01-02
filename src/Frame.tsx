import React from "react";
import Grid from '@mui/material/Grid';
import { Canvas, Line } from './Canvas'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { IconButton } from "@mui/material";

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
  frameNumber: number
}

export class Frame extends React.Component<FrameProps, FrameState> {
  private static suffix: string = 'a';
  private static maskRegExp: RegExp = new RegExp('([A-Z]|[a-z])+.png$');
  private static maxLines = 3;
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
      frameNumber: parseInt(parts[3])
    }
  }

  // Propagate annotation lines from image to mask
  public propagateLines = () => {
    let lines = this.imageCanvas.current?.getLines();
    let imageData = this.maskCanvas.current?.getImageData();
    let image = imageData?.data as Uint8ClampedArray;
    //var rows = imageData?.height, cols = imageData?.width;
    let rows = 512, cols = 512; // FIXME

    // Check if there are enough lines and whether the rows and cols values are defined
    if(lines?.length !== 3 || !rows || !cols || !image) return;

    lines?.forEach(line => {
      let startX = line.getStartX(), endX = line.getEndX(), startY = line.getStartY(), endY = line.getEndY();
      let deltaX = endX - startX;
      let deltaY = endY - startY;

      let slope: [number, number];
      if(Math.abs(deltaX) > Math.abs(deltaY)) {
        if(deltaX > 0) slope = [1, deltaY/Math.abs(deltaX)];
        else slope = [-1, deltaY/Math.abs(deltaX)];
      } else {
        if(deltaY > 0) slope = [deltaX/Math.abs(deltaY), 1];
        else slope = [deltaX/Math.abs(deltaY), -1];
      }

      let row = startX, col = startY, index;
      let roundedRow = row, roundedCol = col; 
      let start = false;
      let maskStartX: number = 0, maskStartY: number = 0, maskEndX: number = 0, maskEndY: number = 0;

      while((deltaX > 0 ? row <= endX : row >= endX) && (deltaY > 0 ? col <= endY : col >= endY)) {
        index = roundedCol*rows*4 + roundedRow*4;
        if(image[index] === 255 && image[index+1] === 255 && image[index+2] === 255 && image[index+3] === 255) {
          if(start === false) {
            start = true;
            maskStartY = roundedCol;
            maskStartX = roundedRow;
          } else {
            maskEndY = roundedCol;
            maskEndX = roundedRow;
          }
        } else if(image[index] === 0 && image[index+1] === 0 && image[index+2] === 0 && image[index+3] === 255) {
          // If we are over background and have already started the line, we break the cycle
          if(start === true) break;
        }
        row += slope[0]; col += slope[1];
        roundedRow = Math.round(row); roundedCol = Math.round(col);
      }      

      // Add the line to the maks and draw it
      this.maskCanvas.current?.addLine(new Line({x: maskStartX, y: maskStartY}, {x: maskEndX, y: maskEndY}));
    })
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

  public render(): JSX.Element {
    return (
      <Grid container rowSpacing={1} columnGap={0} key={this.state.imageName}>
        <Grid item xs={2} sm={2} md={2} display="flex" flexDirection="column" textAlign="center" alignItems="center" justifyContent="center">
          <p>Patient ID: { this.state.patientID }</p>
          <p>Primary Angle: { this.state.primaryAngle }º</p>
          <p>Secondary Angle: { this.state.secondaryAngle }º</p>
          <p>Frame Number: { this.state.frameNumber }</p>
        </Grid>
        {
          this.state.image ?
            <Grid item classes={{ root: "item" }} xs={4} sm={4} md={4}>
                <Canvas ref={this.imageCanvas} backgroundImage={this.state.image} maxLines={Frame.maxLines}></Canvas>
            </Grid>
          :
            <Grid item classes={{ root: "item" }} xs={4} sm={4} md={4}>
              <p>No matching image for mask {this.state.maskName}</p>
            </Grid>  
        }
        <Grid item classes={{ root: "arrowItem" }} xs={1} sm={1} md={1}>
          <IconButton color="primary" component="span" onClick={this.propagateLines}><ArrowForwardIcon/></IconButton>
        </Grid>
        
        {
          this.state.mask ?
            <Grid item classes={{ root: "item" }} xs={4} sm={4} md={4}>
              <Canvas ref={this.maskCanvas} backgroundImage={this.state.mask} maxLines={Frame.maxLines}></Canvas>
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