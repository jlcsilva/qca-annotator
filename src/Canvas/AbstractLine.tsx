import { Point } from "./Point";

export default abstract class AbstractLine {
    private _startPoint: Point;
    private _endPoint: Point;
    private _length: number;
  
    constructor(startPoint: Point, endPoint: Point) {
      this._startPoint = startPoint; 
      this._endPoint = endPoint;
      this._length = this.computeLength();
    }
  
    // Compute the line's length
    private computeLength() {
      return Math.sqrt(Math.pow(this.endX - this.startX, 2) + Math.pow(this.endY - this.startY, 2));
    }
  
    // Draw the line on the given canvas
    public abstract draw(ctx: CanvasRenderingContext2D): void;
  
    // Getters
    public get startPoint() { return this._startPoint }
    public get startX() { return this._startPoint.x }
    public get startY() { return this._startPoint.y }  
    public get endPoint() { return this._endPoint }
    public get endX() { return this._endPoint.x }
    public get endY() { return this._endPoint.y } 
    public get length() { return this._length }
  
    // Setters
    public set startPoint(startPoint: Point) { this._startPoint = startPoint }
    public set startX(startX: number) { this._startPoint.x = startX }
    public set startY(startY: number) { this._startPoint.y = startY }
    public set endPoint(endPoint: Point) { this._endPoint = endPoint }
    public set endX(endX: number) { this._endPoint.x = endX }
    public set endY(endY: number) { this._endPoint.y = endY }
  }