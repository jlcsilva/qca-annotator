import './App.css';
import React from "react";
import Grid from '@mui/material/Grid';  
import Frame from './Frame';
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import Button from '@mui/material/Button'; 
import JSZip from 'jszip';

function App() {
  const [suffix, setSuffix] = React.useState("a");
  const [framesArray, setFramesArray] = React.useState<JSX.Element[]>([]);
  const [framesRefArray, setFramesRefArray] = React.useState<React.RefObject<Frame>[]>([]);

  // Declare reference to file input
  const folderUploadRef = React.useRef<HTMLInputElement | null>(null);
  const filesUploadRef = React.useRef<HTMLInputElement | null>(null);
  React.useEffect( () => {
    if(folderUploadRef != null && folderUploadRef.current != null) {
      folderUploadRef.current.setAttribute("directory", "true");
      folderUploadRef.current.setAttribute("webkitdirectory", "true");
    }
  })

  // Given an unordered array of image and mask Files, return an ordered array of JSX.Elements 
  // containing paired image and mask frames. Mask names are assumed to be of the type 
  // <ImageName> + <Suffix> + .png
  const buildFramesArray = (files: File[]): [JSX.Element[], string[], string[]] => {
    let frames: JSX.Element[] = [];
    let framesRefs: React.RefObject<Frame>[] = [];
    let unmatchedImages: string[] = [], unmatchedMasks: string[] = [];

    // Return if there are no files or the file list is empty
    if(!files || files.length === 0) return [frames, unmatchedImages, unmatchedMasks];
    
    // Sort the files
    files = files.sort((a, b) => {
      return a.name.localeCompare(b.name);
    });

    // i and j are the indices of the current and next file to check, respectively
    let i = 0, j = 1;
    var reference: React.RefObject<Frame>;

    // Iterate the files array to build the frames array
    while(i < files.length && j < files.length + 1) {
      // If the file is a mask
      if(Frame.testMaskRegex(files[i].name)) {
        // If the mask has the right suffix, add it to the frames array with image=null, 
        // and add its name to the unmatched masks array
        if(files[i].name.endsWith(Frame.getMaskSuffix() + '.png')) {
          reference = React.createRef();
          frames.push(<Frame ref={reference} imageFile={null} maskFile={files[i]} name={files[i].name} key={files[i].name}></Frame>);        
          unmatchedMasks.push(files[i].name);
          framesRefs.push(reference);
        }
        i += 1;
        j = i + 1;
      } 
      // If the file is an image and the last, add it to the frames array with mask=null and finish the cycle
      else if(i === files.length - 1) {
        reference = React.createRef();
        frames.push(<Frame ref={reference} imageFile={files[i]} maskFile={null} name={files[i].name} key={files[i].name}></Frame>);
        unmatchedImages.push(files[i].name);
        framesRefs.push(reference);
        break;
      }
      // If the next file is another image, add the current one to the frames array with mask=null
      else if(!Frame.testMaskRegex(files[j].name)) {
        reference = React.createRef();
        frames.push(<Frame ref={reference} imageFile={files[i]} maskFile={null} name={files[i].name} key={files[i].name}></Frame>);
        framesRefs.push(reference);
        i = j;
        j = i + 1;
      }
      // If the next file is a mask but with a wrong suffix, skip
      else if(!files[j].name.endsWith(suffix + '.png')) {
        j += 1
      }
      // If the next file is the corresponding mask, add the image and mask to the frames array
      else if(files[i].name === files[j].name.replace(suffix + '.png', '.png')) {
        reference = React.createRef();
        frames.push(<Frame ref={reference} imageFile={files[i]} maskFile={files[j]} name={files[i].name} key={files[i].name}></Frame>);
        framesRefs.push(reference);
        i = j + 1;
        j = i + 1;
      }
      // If the next file is a mask but not the corresponding one, add both to the frames array 
      // with image=null
      else {
        reference = React.createRef();
        frames.push(<Frame ref={reference} imageFile={files[i]} maskFile={null} name={files[i].name} key={files[i].name}></Frame>);
        framesRefs.push(reference);
        unmatchedImages.push(files[i].name);

        reference = React.createRef();
        frames.push(<Frame ref={reference} imageFile={null} maskFile={files[j]} name={files[j].name} key={files[j].name}></Frame>);
        framesRefs.push(reference);
        unmatchedMasks.push(files[j].name);
        i = j + 1;
        j = i + 1;
      }
    }
    setFramesRefArray(framesRefs);
    return [frames, unmatchedImages, unmatchedMasks];
  }

  // Given an array of unmatched filenames, returns a string containing a warning message,
  // of null, if the array is empty. fileType should contain the type of the files, e.g., 
  // "image" or "mask"
  const unmatchedFilesArrayToMessage = (files: string[], fileType: string): string => {
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    // The files object is the target of event e
    const { files } = e.target;

    if (files && files.length !== 0) {
      let localFramesArray: Array<JSX.Element>, unmatchedImages: string[], unmatchedMasks: string[];

      // Build an array of frame elements from the files array
      [localFramesArray, unmatchedImages, unmatchedMasks] = buildFramesArray(Array.from(files));

      // Assign the locally built frames array to the global one
      setFramesArray(localFramesArray);    

      // Alert the user to the unmatched images and masks
      if(unmatchedImages.length > 0 || unmatchedMasks.length > 0)
        alert(unmatchedFilesArrayToMessage(unmatchedImages, "image") + unmatchedFilesArrayToMessage(unmatchedMasks, "mask"));
    }
  };

  const folderUpload = () => {
    if(folderUploadRef != null && folderUploadRef.current != null) folderUploadRef.current.click();
  }

  const filesUpload = () => {
    if(filesUploadRef != null && filesUploadRef.current != null) filesUploadRef.current.click();
  };

  const handleSuffixChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSuffix(e.target.value);
    Frame.setMaskSuffix(e.target.value);
  }

  // Fit column width to content, assuming the first row has the most columns
  const fitToColumn = (arrayOfArray: Array<Array<any>>) => {
    // get maximum character of each column
    return arrayOfArray[0].map((a, i) => ({ wch: Math.max(...arrayOfArray.map(a2 => a2[i] ? a2[i].toString().length : 0)) }));
  }

  // Return the widths of columns with uniform width that fit to content
  const uniformizeColumnWidth = (arrayOfArray: Array<Array<any>>) => {
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
  const s2ab = (s: string) => {
    var buf = new ArrayBuffer(s.length);
    var view = new Uint8Array(buf);
    for(var i=0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
    return buf;
  }

  const downloadExcel = () => {
    var wb = XLSX.utils.book_new();
    wb.Props = {
      Title: 'QCA Annotations'
    }
    wb.SheetNames.push("QCA");

    // Get lines from frames
    let ws_data: (string | number)[][] = Array.of<(string | number)[]>();
    ws_data.push(
      ['Patient ID', 'Primary Angle', 'Secondary Angle', 'Frame Number', 'Type', 'Diameter 1', 'Diameter 2', 'Diameter 3', 'Diameter Stenosis', 'Area Stenosis']
    )
    let ws_merges: XLSX.Range[] = [];
    framesRefArray.forEach((frameRef, index) => {
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

    var ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!merges'] = ws_merges;
    ws['!cols'] = uniformizeColumnWidth(ws_data);
    wb.Sheets['QCA'] = ws;

    var wbout = XLSX.write(wb, {bookType: 'xlsx', type: 'binary'});
    saveAs(new Blob([s2ab(wbout)], {type: "application/octet-stream"}), 'qca.xlsx');
  }

  const downloadImagesAndMasks = async () => {
    var zip = new JSZip();

    // Build an array with the fetch promises, so that we can wait on all of them before downloading the zip
    var fetches: Promise<void | Response>[] = [];
    framesRefArray.forEach((frameRef) => {
      let frame = frameRef.current;
      if(frame !== null) {
        fetches.push(
          fetch(frame.getImageURL()).then(r => r.blob()).then((blob) => {
            let image: Blob = blob;
            if(frame !== null) zip?.file(frame.getImageName().replace('.png', '_qca.png'), image, {base64: true});
          }),
          fetch(frame.getMaskURL()).then(r => r.blob()).then((blob) => {
            let mask: Blob = blob;
            if(frame !== null) zip?.file(frame.getMaskName().replace('.png', '_qca.png'), mask, {base64: true});
          })
        );
      }
    });

    // Wait on all the fetch promises and then download the zip
    Promise.all(fetches).then(() => {
      zip.generateAsync({type: 'blob'}).then(content => saveAs(content, 'QCA'));
    })
  }

  return (
    <div className='App'>

      <Grid container rowSpacing={1} columnGap={0}>
        {
          // Display the frames, if there are any
          framesArray.length !== 0 &&
            framesArray.map(frame => frame)
        }
      </Grid>
      <Grid container rowSpacing={1} columnGap={0} justifyContent="center" alignItems="center">
          <Grid item xs={1} sm={1} md={1} textAlign="center">
            <input
              style={{ display: "none" }}
              type="file"
              multiple
              ref={folderUploadRef}
              accept=".png"
              onChange={handleFileUpload}
            />
            <Button onClick={folderUpload}>Upload Folder</Button>
          </Grid>
          <Grid item xs={1} sm={1} md={1} textAlign="center">
            <input
              style={{ display: "none" }}
              type="file"
              multiple
              ref={filesUploadRef}
              accept=".png"
              onChange={handleFileUpload}
            />
            <Button onClick={filesUpload}>Upload Files</Button>
          </Grid>
          <Grid item xs={2} sm={2} md={2} textAlign="center">
            <label>Mask suffix:<input type="text" value={ suffix } onChange={(e) => {handleSuffixChange(e)}}/></label>
          </Grid>
          {
            framesArray?.length !== 0 &&
              <Grid item classes={{ root: "item" }} xs={2} sm={2} md={2}>
                <Button onClick={downloadImagesAndMasks}>Download Image and Mask</Button>
              </Grid>
          }
          {
            framesArray?.length !== 0 &&
              <Grid item classes={{ root: "item" }} xs={2} sm={2} md={2}>
                <Button onClick={downloadExcel}>Download Excel</Button>
              </Grid>
          }
        </Grid>  
    </div>
  )
}

export default App;