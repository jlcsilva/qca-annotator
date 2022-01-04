import React from "react";
import Grid from '@mui/material/Grid';
import { Canvas, Line, PixelLine } from './Canvas'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { IconButton } from "@mui/material";
import Slider from '@mui/material/Slider';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button'; 
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";

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
    if(Frame.testMaskRegex(this.props.name)) {
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

  
  private brightnessTimeoutID: NodeJS.Timeout | null = null;
  private handleBrightnessChange = (event: Event, value: number | number[]) => {
    if(typeof value === "number") {
      // Timeout to ensure smooth dragging
      if(this.brightnessTimeoutID === null) {
        this.setState({brightness: value});
        this.imageCanvas.current?.setBrightness(value);
      } else {
        clearTimeout(this.brightnessTimeoutID);
        this.brightnessTimeoutID = setTimeout(() => {
          this.setState({brightness: value});
          this.imageCanvas.current?.setBrightness(value);
        }, 1)
      }
    }
  }

  private contrastTimeoutID: NodeJS.Timeout | null = null;
  private handleContrastChange = (event: Event, value: number | number[]) => {
    if(typeof value === "number") {
      // Timeout to ensure smooth dragging
      if(this.contrastTimeoutID === null) {
        this.setState({contrast: value});
        this.imageCanvas.current?.setContrast(value);
      } else {
        clearTimeout(this.contrastTimeoutID);
        this.contrastTimeoutID = setTimeout(() => {
          this.setState({contrast: value});
          this.imageCanvas.current?.setContrast(value);
        }, 1)
      }
    }
  }

  // Reset the brightness and contrast filters to their default values
  private resetFilters = () => {
    this.setState({brightness: Frame.defaultBrightness, contrast: Frame.defaultContrast});
    this.imageCanvas.current?.setFilters(Frame.defaultBrightness, Frame.defaultContrast);
  }

  // Get the annotated image and mask and download them
  private downloadImageAndMask = () => {
    let imageURL = this.imageCanvas.current?.getDownloadURL();
    let maskURL = this.maskCanvas.current?.getDownloadURL();
    if(imageURL !== undefined) saveAs(imageURL, this.state.imageName.replace('.png', '_qca.png'));
    if(maskURL !== undefined) saveAs(maskURL, this.state.maskName.replace('.png', '_qca.png'));
  }

  // Fit column width to content, assuming the first row has the most columns
  private fitToColumn(arrayOfArray: Array<Array<any>>) {
    // get maximum character of each column
    return arrayOfArray[0].map((a, i) => ({ wch: Math.max(...arrayOfArray.map(a2 => a2[i] ? a2[i].toString().length : 0)) }));
  }
  private s2ab = (s: any) => {
    var buf = new ArrayBuffer(s.length);
    var view = new Uint8Array(buf);
    for(var i=0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
    return buf;
  }

  private downloadExcel = () => {
    var wb = XLSX.utils.book_new();
    wb.Props = {
      Title: this.state.imageName.replace('.png', '')
    }

    wb.SheetNames.push("Sheet 1");
    var lines = this.imageCanvas.current?.getLines();
    var diameters: number[] = [];
    lines?.forEach((line) => { diameters.push(line.getLength()); });
    var ws_data = [
      ['Patient', 'Primary Angle', 'Secondary Angle', 'Frame Number', 'Type', 'Diameter 1', 'Diameter 2', 'Diameter 3', 'Diameter Stenosis', 'Area Stenosis'],
      [this.state.patientID, this.state.primaryAngle, this.state.secondaryAngle, this.state.frameNumber, 'Image', ...diameters, (this.imageCanvas.current?.computeDiameterStenosisPercentage() as number)/100, (this.imageCanvas.current?.computeAreaStenosisPercentage() as number)/100],
      [this.state.patientID, this.state.primaryAngle, this.state.secondaryAngle, this.state.frameNumber, 'Mask', ...diameters, (this.maskCanvas.current?.computeDiameterStenosisPercentage() as number)/100, (this.maskCanvas.current?.computeAreaStenosisPercentage() as number)/100]
    ];
    var ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws["!merges"] = [
      { s: {r: 1, c: 0}, e: {r: 2, c: 0}}, 
      { s: {r: 1, c: 1}, e: {r: 2, c: 1}},
      { s: {r: 1, c: 2}, e: {r: 2, c: 2}},
      { s: {r: 1, c: 3}, e: {r: 2, c: 3}},
    ]
    ws['!cols'] = this.fitToColumn(ws_data);
    wb.Sheets["Sheet 1"] = ws;

    var wbout = XLSX.write(wb, {bookType: 'xlsx', type: 'binary'});
    saveAs(new Blob([this.s2ab(wbout)], {type: "application/octet-stream"}), 'test.xlsx');
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
            <Grid item classes={{ root: "item" }} xs={3} sm={3} md={3}>
                <Canvas ref={this.imageCanvas} backgroundImage={this.state.image} maxLines={Frame.maxLines} brightness={this.state.brightness} contrast={this.state.contrast}></Canvas>
            </Grid>
          :
            <Grid item classes={{ root: "item" }} xs={3} sm={3} md={3}>
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
            <Grid item classes={{ root: "item" }} xs={3} sm={3} md={3}>
              <Canvas ref={this.maskCanvas} backgroundImage={this.state.mask} maxLines={Frame.maxLines} brightness={Frame.defaultBrightness} contrast={Frame.defaultContrast}></Canvas>
            </Grid>
          :
            <Grid item classes={{ root: "item" }} xs={3} sm={3} md={3}>
              <p>No matching mask for image {this.state.imageName}</p>
            </Grid>
        }
        <Grid item classes={{ root: "arrowItem" }} xs={2} sm={2} md={2}>
          <div>
            <Button onClick={this.downloadImageAndMask}>Download Image and Mask</Button>
            <br></br>
            <Button onClick={this.downloadExcel}>Download Excel</Button>
          </div>
        </Grid>
      </Grid>
    );
  }
}

export default Frame;