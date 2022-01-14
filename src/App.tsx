import './App.css';
import React from "react";
import Grid from '@mui/material/Grid';  
import Frame from './Frame';
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import Button from '@mui/material/Button'; 
import JSZip from 'jszip';

type AppState = {
  suffix: string,                                                               // Mask suffix
  framesArray: JSX.Element[],                                                   // Array containing the uploaded frames
  framesRefArray: React.RefObject<Frame>[]                                      // Array containing references to the Frame components created
}

export class App extends React.Component<{}, AppState> {
  private folderUploadRef = React.createRef<HTMLInputElement>();                // Reference to the folder upload input field
  private filesUploadRef = React.createRef<HTMLInputElement>();                 // Reference to the files upload input field

  // Initial app state
  state: AppState = {
    suffix: Frame.maskSuffix,
    framesArray: [],
    framesRefArray: []
  }

  // Getters
  public get suffix(): string { return this.state.suffix }
  public get framesArray(): JSX.Element[] { return this.state.framesArray }
  public get framesRefArray(): React.RefObject<Frame>[] { return this.state.framesRefArray }

  componentDidMount() {
    // Make the folder upload field allow the upload of folders instead of files
    if(this.folderUploadRef && this.folderUploadRef.current) {
      this.folderUploadRef.current.setAttribute("directory", "true");
      this.folderUploadRef.current.setAttribute("webkitdirectory", "true");
    }
  }  

  /***************************************************************************************************/
  /************************************* User interaction methods ************************************/
  /***************************************************************************************************/

  // Trigger a folder upload
  public folderUpload = () => {
    if(this.folderUploadRef && this.folderUploadRef.current) this.folderUploadRef.current.click();
  }

  // Trigger files upload
  public filesUpload = () => {
    if(this.filesUploadRef && this.filesUploadRef.current) this.filesUploadRef.current.click();
  };

  // Update the expected mask suffix
  public handleSuffixChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ suffix: e.target.value });
    Frame.maskSuffix = e.target.value;
  }

  /***************************************************************************************************/
  /*************************************** File upload methods ***************************************/
  /***************************************************************************************************/

  public handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    // The files object is the target of event e
    const { files } = e.target;

    if (files && files.length !== 0) {
      let localFramesArray: Array<JSX.Element>, unmatchedImages: string[], unmatchedMasks: string[];

      // Build an array of frame elements from the files array
      [localFramesArray, unmatchedImages, unmatchedMasks] = this.buildFramesArray(Array.from(files));

      // Assign the locally built frames array to the global one
      this.setState({ framesArray: localFramesArray });

      // Alert the user to the unmatched images and masks
      if(unmatchedImages.length > 0 || unmatchedMasks.length > 0)
        alert(this.unmatchedFilesArrayToMessage(unmatchedImages, "image") + this.unmatchedFilesArrayToMessage(unmatchedMasks, "mask"));
      else if(localFramesArray.length === 0) alert("No valid frames detected");
    }
  }
  
  // Given an unordered array of image and mask Files, return an ordered array of JSX.Elements 
  // containing paired image and mask frames. Mask names are assumed to be of the type 
  // <ImageName> + <Suffix> + .png
  public buildFramesArray = (files: File[]): [JSX.Element[], string[], string[]] => {
    let frames: JSX.Element[] = [];
    let frameRefs: React.RefObject<Frame>[] = [];
    let unmatchedImages: string[] = [], unmatchedMasks: string[] = [];

    // Return if there are no files or the file list is empty
    if(!files || files.length === 0) return [frames, unmatchedImages, unmatchedMasks];
    
    // Sort the files
    files = files.sort((a, b) => a.name.localeCompare(b.name));

    // i and j are the indices of the current and next file to check, respectively
    var i = 0, j = 1;
    var reference: React.RefObject<Frame>;

    // Iterate the files array to build the frames array
    while(i < files.length) {            
      // If the file is a mask
      if(Frame.testMaskRegex(files[i].name)) {
        // If the mask has the right suffix, add it to the frames array with image=null, 
        // and add its name to the unmatched masks array
        if(files[i].name.endsWith(Frame.maskSuffix + '.png')) {
          reference = React.createRef();
          frames.push(<Frame ref={reference} imageFile={null} maskFile={files[i]} name={files[i].name} key={files[i].name}></Frame>);        
          unmatchedMasks.push(files[i].name);
          frameRefs.push(reference);
        }
        i += 1;
        j = i + 1;
      } 
      // If the file is an image and the last, add it to the frames array with mask=null and finish the cycle
      else if(i === files.length - 1 || j >= files.length) {        
        reference = React.createRef();
        frames.push(<Frame ref={reference} imageFile={files[i]} maskFile={null} name={files[i].name} key={files[i].name}></Frame>);
        unmatchedImages.push(files[i].name);
        frameRefs.push(reference);
        break;
      }
      // If the next file is another image, add the current one to the frames array with mask=null
      else if(!Frame.testMaskRegex(files[j].name)) {
        reference = React.createRef();
        frames.push(<Frame ref={reference} imageFile={files[i]} maskFile={null} name={files[i].name} key={files[i].name}></Frame>);
        frameRefs.push(reference);
        unmatchedImages.push(files[i].name);
        i = j;
        j = i + 1;
      }
      // If the next file is a mask but with a wrong suffix, skip
      else if(!files[j].name.endsWith(this.suffix + '.png')) {
        j += 1
      }
      // If the next file is the corresponding mask, add the image and mask to the frames array
      else if(files[i].name === files[j].name.replace(this.suffix + '.png', '.png')) {
        reference = React.createRef();
        frames.push(<Frame ref={reference} imageFile={files[i]} maskFile={files[j]} name={files[i].name} key={files[i].name}></Frame>);
        frameRefs.push(reference);
        i = j + 1;
        j = i + 1;
      }
      // If the next file is a mask with the right suffix but not the corresponding one, add both to the frames array with image=null
      else {
        reference = React.createRef();
        frames.push(<Frame ref={reference} imageFile={files[i]} maskFile={null} name={files[i].name} key={files[i].name}></Frame>);
        frameRefs.push(reference);
        unmatchedImages.push(files[i].name);

        reference = React.createRef();
        frames.push(<Frame ref={reference} imageFile={null} maskFile={files[j]} name={files[j].name} key={files[j].name}></Frame>);
        frameRefs.push(reference);
        unmatchedMasks.push(files[j].name);
        i = j + 1;
        j = i + 1;
      }    
    }
    this.setState({ framesRefArray: frameRefs });
    return [frames, unmatchedImages, unmatchedMasks];
  }

  // Given an array of unmatched filenames, returns a string containing a warning message,
  // of null, if the array is empty. fileType should contain the type of the files, e.g., 
  // "image" or "mask"
  public unmatchedFilesArrayToMessage = (files: string[], fileType: string): string => {
    let message: string = "";

    // Empty message if the array is empty
    if(!files || files.length === 0) return message; 

    // Message header
    if(fileType === "image") message = "The following images have no matching masks:\n";
    else if(fileType === "mask") message = "The following masks have no matching images:\n";
    else message = "The following files are unmatched:\n";

    // Message body
    files.forEach( filename => message += filename + "\n");

    return message;
  }

  /***************************************************************************************************/
  /************************************** Excel download methods *************************************/
  /***************************************************************************************************/

  // Download the excel containing the stenosis data
  public downloadExcel = () => {
    // Create a workbook and set its title
    var wb = XLSX.utils.book_new();
    wb.Props = { Title: 'QCA Annotations' }
    wb.SheetNames.push("QCA");

    // Create a list of strings and numbers to store the data, and a list of cells to merge
    let ws_data: (string | number)[][] = Array.of<(string | number)[]>();
    let ws_merges: XLSX.Range[] = [];

    // Insert the header into the list
    ws_data.push(
      ['Patient ID', 'Primary Angle', 'Secondary Angle', 'Frame Number', 'Type', 'Diameter 1', 'Diameter 2', 'Diameter 3', 'Diameter Stenosis', 'Area Stenosis']
    )

    // For each frame, push its data into the list and update the list of cell merges
    this.framesRefArray.forEach((frameRef, index) => {
      let frame = frameRef.current;
      if(frame) {
        ws_data.push(...frame.getSpreadsheetRow());
        ws_merges.push(
          { s: {r: 2*index + 1, c: 0}, e: {r: 2*index + 2, c: 0}}, 
          { s: {r: 2*index + 1, c: 1}, e: {r: 2*index + 2, c: 1}},
          { s: {r: 2*index + 1, c: 2}, e: {r: 2*index + 2, c: 2}},
          { s: {r: 2*index + 1, c: 3}, e: {r: 2*index + 2, c: 3}}
        )
      }
    });

    // Convert the array of arrays into an excel sheet
    var ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!merges'] = ws_merges;
    ws['!cols'] = this.uniformizeColumnWidth(ws_data);
    wb.Sheets['QCA'] = ws;

    // Save the file
    var wbout = XLSX.write(wb, {bookType: 'xlsx', type: 'binary'});
    saveAs(new Blob([this.s2ab(wbout)], {type: "application/octet-stream"}), 'qca.xlsx');
  }

  // Fit column width to content, assuming the first row has the most columns
  public fitToColumn = (arrayOfArray: Array<Array<any>>) => {
    // get maximum character of each column
    return arrayOfArray[0].map((a, i) => ({ wch: Math.max(...arrayOfArray.map(a2 => a2[i] ? a2[i].toString().length : 0)) }));
  }

  // Return the widths of columns with uniform width that fit to content
  public uniformizeColumnWidth = (arrayOfArray: Array<Array<any>>) => {
    let max = 0, length = arrayOfArray.length;
    arrayOfArray[0].forEach((a, i) => {
      let width = Math.max(...arrayOfArray.map(a2 => a2[i] ? a2[i].toString().length : 0));
      max = width > max ? width : max;
    });
    let columnWidths = [];
    for(var i = 0; i < length; i++) columnWidths.push({wch: max});
    return columnWidths;
  }

  // Conver string to array buffer
  public s2ab = (s: string) => {
    var buf = new ArrayBuffer(s.length);
    var view = new Uint8Array(buf);
    for(var i=0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
    return buf;
  }

  /***************************************************************************************************/
  /********************************** Image and mask download methods ********************************/
  /***************************************************************************************************/

  // Download the images and masks
  public downloadImagesAndMasks = async () => {
    var zip = new JSZip();
    var fetches: Promise<void | Response>[] = [];

    // Build an array of fetch promises, allowing to wait for all images before downloading the zip    
    this.framesRefArray.forEach((frameRef) => {
      let frame = frameRef.current;
      // If the frame is not null, push the image and mask fetches to the list
      if(frame) {
        fetches.push(
          fetch(frame.imageURL).then(r => r.blob()).then((blob) => {
            if(frame) zip?.file(frame.imageName.replace('.png', '_qca.png'), blob, {base64: true});
          }),
          fetch(frame.maskURL).then(r => r.blob()).then((blob) => {
            if(frame) zip?.file(frame.maskName.replace('.png', '_qca.png'), blob, {base64: true});
          })
        );
      }
    });

    // Wait on all the fetch promises and then download the zip
    Promise.all(fetches).then(() => {
      zip.generateAsync({type: 'blob'}).then(content => saveAs(content, 'QCA'));
    })
  }

  public render() {
    return (
      <div className='App'>
        <Grid container rowSpacing={1} columnGap={0}>
          { // Display the frames, if there are any
            this.framesArray.length !== 0 &&
              this.framesArray.map(frame => frame)
          }
        </Grid>

        <Grid container rowSpacing={1} columnGap={0} justifyContent="center" alignItems="center">
  
            <Grid item xs={1} sm={1} md={1} textAlign="center">
              <input style={{ display: "none" }} type="file" multiple ref={this.folderUploadRef} accept=".png" onChange={this.handleFileUpload}/>
              <Button onClick={this.folderUpload}>Upload Folder</Button>
            </Grid>

            <Grid item xs={1} sm={1} md={1} textAlign="center">
              <input style={{ display: "none" }} type="file" multiple ref={this.filesUploadRef} accept=".png" onChange={this.handleFileUpload}/>
              <Button onClick={this.filesUpload}>Upload Files</Button>
            </Grid>

            <Grid item xs={2} sm={2} md={2} textAlign="center">
              <label>Mask suffix:<input type="text" value={ this.suffix } onChange={this.handleSuffixChange}/></label>
            </Grid>

            { // If there are frames, show the image and mask download button
              this.framesArray?.length !== 0 &&
                <Grid item classes={{ root: "item" }} xs={2} sm={2} md={2}>
                  <Button onClick={this.downloadImagesAndMasks}>Download Images and Masks</Button>
                </Grid>
            }

            { // If there are frames, show the excel download button
              this.framesArray?.length !== 0 &&
                <Grid item classes={{ root: "item" }} xs={2} sm={2} md={2}>
                  <Button onClick={this.downloadExcel}>Download Excel</Button>
                </Grid>
            }
          </Grid>  
      </div>
    )
  }
}

export default App;