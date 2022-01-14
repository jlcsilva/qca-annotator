import GenericLine from "./AbstractLine";

// Class for a fluid line drawn using the canvas canvas API, with sub-pixel precision
export class FluidLine extends GenericLine {
    // Draw the line on the canvas associated to the given context
    public draw(ctx: CanvasRenderingContext2D) {
      ctx.beginPath();
      ctx.moveTo(this.startX, this.startY);
      ctx.lineTo(this.endX, this.endY);
      ctx.stroke();
      ctx.closePath();
    }
  }