import ClientStructure from "./ClientStructure";
import deleteButtonIconSVG from "../icons/delete_zone.svg";
import scaleButtonIconSVG from "../icons/scale_zone.svg";
import {StructureInterceptionHandlerResult} from "../Structure";
import {Canvas2DContextTrackingWrapper} from "../../utils/Canvas2DContextTrackingWrapper";
import {PointCoordinates} from "../../utils/types";
import {calculateBoxAroundPoint, considerHiDPI, isInsideBox} from "../../utils/helpers";
import {dragRectangleEdge, getScreenCorners, getScreenTopLeftEdges, isShownSideways} from "../../utils/screenCorners";

const img_delete_button = new Image();
img_delete_button.src = deleteButtonIconSVG;

const img_scale_button = new Image();
img_scale_button.src = scaleButtonIconSVG;

class ZoneClientStructure extends ClientStructure {
    public static readonly TYPE = "ZoneClientStructure";

    public x1: number;
    public y1: number;

    constructor(
        x0: number, y0: number,
        x1: number, y1: number,
        active?: boolean
    ) {
        super(x0, y0);

        this.x1 = x1;
        this.y1 = y1;

        this.active = active ?? true;


        this.x0 = Math.min(x0, x1);
        this.x1 = Math.max(x0, x1);

        this.y0 = Math.min(y0, y1);
        this.y1 = Math.max(y0, y1);
    }

    draw(ctxWrapper: Canvas2DContextTrackingWrapper, transformationMatrixToScreenSpace: DOMMatrixInit, scaleFactor: number, pixelSize: number): void {
        const ctx = ctxWrapper.getContext();
        const p0 = new DOMPoint(this.x0, this.y0).matrixTransform(transformationMatrixToScreenSpace);
        const p1 = new DOMPoint(this.x1, this.y1).matrixTransform(transformationMatrixToScreenSpace);
        const {topLeft, bottomRight} = getScreenCorners(this.getBounds(), transformationMatrixToScreenSpace);

        const scaledDeleteButtonSize = this.getControlElementImageScaledSize(img_delete_button, scaleFactor);
        const scaledScaleButtonSize = this.getControlElementImageScaledSize(img_scale_button, scaleFactor);

        const dimensions = {
            x: ((Math.round(this.x1) - Math.round(this.x0)) * pixelSize) / 100,
            y: ((Math.round(this.y1) - Math.round(this.y0)) * pixelSize) / 100
        };
        // Width x height as seen on screen
        const label = isShownSideways(transformationMatrixToScreenSpace) ?
            dimensions.y.toFixed(2) + " x " + dimensions.x.toFixed(2) + "m" :
            dimensions.x.toFixed(2) + " x " + dimensions.y.toFixed(2) + "m";

        ctxWrapper.save();

        if (!this.active) {
            ctx.strokeStyle = "rgb(255, 255, 255)";
            ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        } else {
            ctx.setLineDash([considerHiDPI(15), considerHiDPI(5)]);
            ctx.strokeStyle = "rgb(255, 255, 255)";
            ctx.fillStyle = "rgba(255, 255, 255, 0)";
        }
        ctx.lineWidth = considerHiDPI(2);

        ctx.save();
        ctx.strokeStyle = "rgba(0,0,0, 0.8)";
        ctx.lineWidth = ctx.lineWidth + considerHiDPI(2);
        ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
        ctx.restore();

        ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
        ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);

        ctxWrapper.restore();

        ctxWrapper.save();
        const fontSize = 4 * scaleFactor;
        if (fontSize >= 20) {
            ctx.textAlign = "start";
            ctx.fillStyle = "rgba(255, 255, 255, 1)";
            ctx.strokeStyle = "rgba(18, 18, 18, 1)";
            ctx.font = `${fontSize}px "IBM Plex Sans", "Helvetica", sans-serif`;

            const textXOffset = (scaledDeleteButtonSize.width / 2) + considerHiDPI(5);

            ctx.lineWidth = considerHiDPI(3);
            ctx.strokeText(label, topLeft.x + textXOffset, topLeft.y - considerHiDPI(8));

            ctx.lineWidth = considerHiDPI(1);
            ctx.fillText(label, topLeft.x + textXOffset, topLeft.y - considerHiDPI(8));
        }

        ctxWrapper.restore();

        if (this.active) {

            ctx.drawImage(
                this.getOptimizedImage(img_delete_button, scaledDeleteButtonSize.width, scaledDeleteButtonSize.height),
                topLeft.x - scaledDeleteButtonSize.width / 2,
                topLeft.y - scaledDeleteButtonSize.height / 2,
                scaledDeleteButtonSize.width,
                scaledDeleteButtonSize.height
            );

            ctx.drawImage(
                this.getOptimizedImage(img_scale_button, scaledScaleButtonSize.width, scaledScaleButtonSize.height),
                bottomRight.x - scaledScaleButtonSize.width / 2,
                bottomRight.y - scaledScaleButtonSize.height / 2,
                scaledScaleButtonSize.width,
                scaledScaleButtonSize.height
            );
        }
    }

    private getBounds() {
        return {minX: this.x0, minY: this.y0, maxX: this.x1, maxY: this.y1};
    }

    postProcess(): void {
        this.isResizing = false;

        this.x0 = Math.round(this.x0);
        this.y0 = Math.round(this.y0);

        this.x1 = Math.round(this.x1);
        this.y1 = Math.round(this.y1);
    }

    tap(tappedPoint : PointCoordinates, transformationMatrixToScreenSpace: DOMMatrixInit, scaleFactor: number) : StructureInterceptionHandlerResult {
        const p0 = new DOMPoint(this.x0, this.y0).matrixTransform(transformationMatrixToScreenSpace);
        const p1 = new DOMPoint(this.x1, this.y1).matrixTransform(transformationMatrixToScreenSpace);

        const scaledDeleteButtonSize = this.getControlElementImageScaledSize(img_delete_button, scaleFactor);
        const deleteButtonHitboxPadding = Math.max(scaledDeleteButtonSize.width, scaledDeleteButtonSize.height) / 2;
        const {topLeft} = getScreenCorners(this.getBounds(), transformationMatrixToScreenSpace);
        const deleteButtonHitbox = calculateBoxAroundPoint(topLeft, deleteButtonHitboxPadding);

        if (this.active && isInsideBox(tappedPoint, deleteButtonHitbox )) {
            return {
                deleteMe: true,
                stopPropagation: true
            };
        } else if (isInsideBox(tappedPoint, {topLeftBound: p0, bottomRightBound: p1})) {
            this.active = true;

            return {
                stopPropagation: true
            };
        } else if (this.active) {
            this.active = false;

            return {
                stopPropagation: false,
                requestDraw: true
            };
        } else {
            return {
                stopPropagation: false
            };
        }
    }

    translate(
        startCoordinates: PointCoordinates,
        lastCoordinates: PointCoordinates,
        currentCoordinates: PointCoordinates,
        transformationMatrixToScreenSpace : DOMMatrixInit,
        scaleFactor: number,
        pixelSize: number
    ) : StructureInterceptionHandlerResult {
        if (this.active) {
            const p0 = new DOMPoint(this.x0, this.y0).matrixTransform(transformationMatrixToScreenSpace);
            const p1 = new DOMPoint(this.x1, this.y1).matrixTransform(transformationMatrixToScreenSpace);

            const scaledScaleButtonSize = this.getControlElementImageScaledSize(img_scale_button, scaleFactor);
            const scaleButtonHitboxPadding = Math.max(scaledScaleButtonSize.width, scaledScaleButtonSize.height) / 2;
            const {bottomRight} = getScreenCorners(this.getBounds(), transformationMatrixToScreenSpace);
            const scaleButtonHitbox = calculateBoxAroundPoint(bottomRight, scaleButtonHitboxPadding);

            if (!this.isResizing && isInsideBox(lastCoordinates, scaleButtonHitbox)) {
                this.isResizing = true;
            }

            const {
                dx,
                dy,
                currentInMapSpace
            } = ClientStructure.calculateTranslateDelta(lastCoordinates, currentCoordinates, transformationMatrixToScreenSpace);

            if (this.isResizing) {
                // The resize button is on whichever corner is shown at the bottom right, opposite the top left one
                const {xIsMin, yIsMin} = getScreenTopLeftEdges(transformationMatrixToScreenSpace);

                if (xIsMin) {
                    this.x1 = dragRectangleEdge(this.x1, this.x0, dx, currentInMapSpace.x, pixelSize);
                } else {
                    this.x0 = dragRectangleEdge(this.x0, this.x1, dx, currentInMapSpace.x, pixelSize);
                }
                if (yIsMin) {
                    this.y1 = dragRectangleEdge(this.y1, this.y0, dy, currentInMapSpace.y, pixelSize);
                } else {
                    this.y0 = dragRectangleEdge(this.y0, this.y1, dy, currentInMapSpace.y, pixelSize);
                }

                return {
                    stopPropagation: true
                };
            } else if (isInsideBox(lastCoordinates, {topLeftBound: p0, bottomRightBound: p1})) {
                this.x0 += dx;
                this.y0 += dy;
                this.x1 += dx;
                this.y1 += dy;

                return {
                    stopPropagation: true
                };
            } else {
                this.active = false;
            }
        }

        return {
            stopPropagation: false
        };
    }
}

export default ZoneClientStructure;
