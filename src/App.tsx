import './App.css';
import React from "react";
import Grid from '@mui/material/Grid';  
import Frame from './Frame';

function App() {
  const [suffix, setSuffix] = React.useState("a");
  const [framesArray, setFramesArray] = React.useState<JSX.Element[] | null>(null);

  // Declare reference to file input
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  React.useEffect( () => {
    if(inputRef != null && inputRef.current != null) {
      inputRef.current.setAttribute("directory", "true");
      inputRef.current.setAttribute("webkitdirectory", "true");
    }
  })

  // Given an unordered array of image and mask Files, return an ordered array of JSX.Elements 
  // containing paired image and mask frames. Mask names are assumed to be of the type 
  // <ImageName> + <Suffix> + .png
  const buildFramesArray = (files: File[]): [JSX.Element[], string[], string[]] => {
    let frames: JSX.Element[] = [];
    let unmatchedImages: string[] = [], unmatchedMasks: string[] = [];

    // Return if there are no files or the file list is empty
    if(!files || files.length === 0) return [frames, unmatchedImages, unmatchedMasks];
    
    // Sort the files
    files = files.sort((a, b) => {
      return a.name.localeCompare(b.name);
    });

    // i and j are the indices of the current and next file to check, respectively
    let i = 0, j = 1;

    // Iterate the files array to build the frames array
    while(i < files.length && j < files.length + 1) {
      // If the file is a mask
      if(Frame.testMaskRegex(files[i].name)) {
        // If the mask has the right suffix, add it to the frames array with image=null, 
        // and add its name to the unmatched masks array
        if(files[i].name.endsWith(Frame.getMaskSuffix() + '.png')) {
          frames.push(<Frame imageFile={null} maskFile={files[i]} name={files[i].name} key={files[i].name}></Frame>);        
          unmatchedMasks.push(files[i].name);
        }
        i += 1;
        j = i + 1;
      } 
      // If the file is an image and the last, add it to the frames array with mask=null and finish the cycle
      else if(i === files.length - 1) {
        frames.push(<Frame imageFile={files[i]} maskFile={null} name={files[i].name} key={files[i].name}></Frame>);
        unmatchedImages.push(files[i].name);
        break;
      }
      // If the next file is another image, add the current one to the frames array with mask=null
      else if(!Frame.testMaskRegex(files[j].name)) {
        frames.push(<Frame imageFile={files[i]} maskFile={null} name={files[i].name} key={files[i].name}></Frame>);
        i = j;
        j = i + 1;
      }
      // If the next file is a mask but with a wrong suffix, skip
      else if(!files[j].name.endsWith(suffix + '.png')) {
        j += 1
      }
      // If the next file is the corresponding mask, add the image and mask to the frames array
      else if(files[i].name === files[j].name.replace(suffix + '.png', '.png')) {
        frames.push(<Frame imageFile={files[i]} maskFile={files[j]} name={files[i].name} key={files[i].name}></Frame>);
        i = j + 1;
        j = i + 1;
      }
      // If the next file is a mask but not the corresponding one, add both to the frames array 
      // with image=null
      else {
        frames.push(<Frame imageFile={files[i]} maskFile={null} name={files[i].name} key={files[i].name}></Frame>);
        unmatchedImages.push(files[i].name);
        frames.push(<Frame imageFile={null} maskFile={files[j]} name={files[j].name} key={files[j].name}></Frame>);
        unmatchedMasks.push(files[j].name);
        i = j + 1;
        j = i + 1;
      }
    }
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

  const onUploadButtonClick = () => {
    if(inputRef != null && inputRef.current != null) inputRef.current.click();
  };

  const handleSuffixChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSuffix(e.target.value);
    Frame.setMaskSuffix(e.target.value);
  }

  return (
    <div className='App'>

      <Grid container rowSpacing={1} columnGap={0}>
        {
          // Display the frames, if there are any
          framesArray &&
            framesArray.map(frame => frame)
        }
      </Grid>
    
      <Grid container rowSpacing={1} columnGap={0} justifyContent="center" alignItems="center">
          <Grid item xs={2} sm={2} md={2} textAlign="center">
            <input
              style={{ display: "none" }}
              type="file"
              multiple
              ref={inputRef}
              accept=".png"
              onChange={handleFileUpload}
            />
            <div className='button' onClick={onUploadButtonClick}>
              Upload Files
            </div>
          </Grid>
          <Grid item xs={2} sm={2} md={2} textAlign="center">
            <label>Mask suffix:<input type="text" value={ suffix } onChange={(e) => {handleSuffixChange(e)}}/></label>
          </Grid>
        </Grid>  
    </div>
  )
}

export default App;