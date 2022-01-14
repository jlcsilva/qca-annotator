import GenericLine from "./AbstractLine";
import { Point } from "./Point";

// Class for a line drawn pixel by pixel
export class PixelLine extends GenericLine {
    private _slope: [number, number];
    private points: Point[] = [];
  
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
      this.computePixelCoordinates();
    }

    // Compute the coordinates of the pixels to be drawn
    public computePixelCoordinates() {
      let x = this.startX, y = this.startY;
      let lastX = Math.round(x)-1, lastY = Math.round(y)-1;
      while((this.slope[0] > 0 ? x <= this.endX : x >= this.endX) && (this.slope[1] > 0 ? y <= this.endY : y >= this.endY)) {
        if(Math.round(x) !== lastX || Math.round(y) !== lastY) {
          lastX = Math.round(x);
          lastY = Math.round(y);
          this.points.push({x: lastX, y: lastY});
        }
        x += this.slope[0]; 
        y += this.slope[1];
      }
    }
  
    // Getter
    public get slope(): [number, number] { return this._slope }
  
    // Draw the line on the given Canvas context, filling the pixels one by one
    public draw(ctx: CanvasRenderingContext2D) {
      this.points.forEach(point => ctx.fillRect(point.x, point.y, 1, 1));
      //await Promise.all(this.points.map(point => ctx.fillRect(point.x, point.y, 1, 1)));
    }
  }