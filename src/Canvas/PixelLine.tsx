import { GenericLine } from "./GenericLine";
import { Point } from "./Point";

// Class for a line drawn pixel by pixel
export class PixelLine extends GenericLine {
    private _slope: [number, number];
  
    constructor(startPoint: Point, endPoint: Point) {
      super(startPoint, endPoint);
      let deltaX = this.endX - this.startX;
      let deltaY = this.endY - this.startY;
      if(Math.abs(deltaX) > Math.abs(deltaY)) {
        let relSlope = deltaY/Math.abs(deltaX);
        this._slope = deltaX > 0 ? [1, relSlope] : [-1, relSlope];
      } else {
        let relSlope = deltaX/Math.abs(deltaY);
        this._slope = deltaY > 0 ? [relSlope, 1] : [relSlope, -1]
      }
    }
  
    // Getter
    public get slope() { return this._slope }
  
    // Draw the line on the given Canvas context, filling the pixels one by one
    public draw(ctx: CanvasRenderingContext2D) {
      let x = this.startX, y = this.startY;
      while((this.slope[0] > 0 ? x <= this.endX : x >= this.endX) && (this.slope[1] > 0 ? y <= this.endY : y >= this.endY)) {
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
        x += this.slope[0]; 
        y += this.slope[1];
      }
    }
  }