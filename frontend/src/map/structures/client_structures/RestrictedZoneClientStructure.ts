import ClientStructure from "./ClientStructure";
import deleteButtonIconSVG from "../icons/delete_zone.svg";
import scaleButtonIconSVG from "../icons/scale_zone.svg";
import {StructureInterceptionHandlerResult} from "../Structure";
import {Canvas2DContextTrackingWrapper} from "../../utils/Canvas2DContextTrackingWrapper";
import {PointCoordinates} from "../../utils/types";
import {calculateBoxAroundPoint, considerHiDPI, isInsideBox} from "../../utils/helpers";
import {dragRectangleEdge, getScreenCorners, getScreenTopLeftEdges} from "../../utils/screenCorners";

const img_delete_button = new Image();
img_delete_button.src = deleteButtonIconSVG;

const img_scale_button = new Image();
img_scale_button.src = scaleButtonIconSVG;

abstract class RestrictedZoneClientStructure extends ClientStructure {
    protected activeStyle : { stroke: string, fill: string } = {
        stroke: "rgb(0, 255, 0)",
        fill: "rgba(0, 255, 0, 0)"
    };

    protected style : { stroke: string, fill: string } = {
        stroke: "rgb(0, 255, 0)",
        fill: "rgba(0, 255, 0, 0.4)"
    };

    public x1: number;
    public y1: number;
    public x2: number;
    public y2: number;
    public x3: number;
    public y3: number;

    constructor(
        x0: number, y0: number,
        x1: number, y1: number,
        x2: number, y2: number,
        x3: number, y3: number,
        active?: boolean
    ) {
        super(x0, y0);

        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
        this.x3 = x3;
        this.y3 = y3;

        this.active = active ?? true;
    }

    draw(ctxWrapper: Canvas2DContextTrackingWrapper, transformationMatrixToScreenSpace: DOMMatrixInit, scaleFactor: number): void {
        const ctx = ctxWrapper.getContext();
        const p0 = new DOMPoint(this.x0, this.y0).matrixTransform(transformationMatrixToScreenSpace);
        const p1 = new DOMPoint(this.x1, this.y1).matrixTransform(transformationMatrixToScreenSpace);
        const p2 = new DOMPoint(this.x2, this.y2).matrixTransform(transformationMatrixToScreenSpace);
        const p3 = new DOMPoint(this.x3, this.y3).matrixTransform(transformationMatrixToScreenSpace);


        ctxWrapper.save();

        ctx.lineWidth = considerHiDPI(5);
        ctx.lineCap = "round";

        if (!this.active) {
            ctx.strokeStyle = this.style.stroke;
            ctx.fillStyle = this.style.fill;
        } else {
            ctx.setLineDash([
                considerHiDPI(8),
                considerHiDPI(6)
            ]);
            ctx.strokeStyle = this.style.stroke;
            ctx.fillStyle = this.style.fill;
        }

        ctx.save();
        ctx.strokeStyle = "rgba(0,0,0, 0.8)";
        ctx.lineWidth = ctx.lineWidth + considerHiDPI(2);

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();

        ctx.stroke();

        ctx.restore();


        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();

        ctx.fill();
        ctx.stroke();


        ctxWrapper.restore();


        if (this.active) {
            const {topLeft, bottomRight} = getScreenCorners(this.getBounds(), transformationMatrixToScreenSpace);
            const scaledDeleteButtonSize = this.getControlElementImageScaledSize(img_delete_button, scaleFactor);
            const scaledScaleButtonSize = this.getControlElementImageScaledSize(img_scale_button, scaleFactor);

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
        return {
            minX: Math.min(this.x0, this.x1, this.x2, this.x3),
            minY: Math.min(this.y0, this.y1, this.y2, this.y3),
            maxX: Math.max(this.x0, this.x1, this.x2, this.x3),
            maxY: Math.max(this.y0, this.y1, this.y2, this.y3)
        };
    }

    postProcess(): void {
        this.isResizing = false;

        this.x0 = Math.round(this.x0);
        this.y0 = Math.round(this.y0);

        this.x1 = Math.round(this.x1);
        this.y1 = Math.round(this.y1);

        this.x2 = Math.round(this.x2);
        this.y2 = Math.round(this.y2);

        this.x3 = Math.round(this.x3);
        this.y3 = Math.round(this.y3);
    }

    tap(tappedPoint : PointCoordinates, transformationMatrixToScreenSpace: DOMMatrixInit, scaleFactor: number) : StructureInterceptionHandlerResult {
        const p0 = new DOMPoint(this.x0, this.y0).matrixTransform(transformationMatrixToScreenSpace);
        const p2 = new DOMPoint(this.x2, this.y2).matrixTransform(transformationMatrixToScreenSpace);

        const scaledDeleteButtonSize = this.getControlElementImageScaledSize(img_delete_button, scaleFactor);
        const deleteButtonHitboxPadding = Math.max(scaledDeleteButtonSize.width, scaledDeleteButtonSize.height) / 2;
        const {topLeft} = getScreenCorners(this.getBounds(), transformationMatrixToScreenSpace);
        const deleteButtonHitbox = calculateBoxAroundPoint(topLeft, deleteButtonHitboxPadding);

        if (this.active && isInsideBox(tappedPoint, deleteButtonHitbox)) {
            return {
                deleteMe: true,
                stopPropagation: true
            };
        } else if (isInsideBox(tappedPoint, {topLeftBound: p0, bottomRightBound: p2})) {
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
            const p2 = new DOMPoint(this.x2, this.y2).matrixTransform(transformationMatrixToScreenSpace);

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
                /*
                 * The resize button is on whichever corner is shown at the bottom right, opposite the top left one.
                 * Only the corners on the dragged edges move, each staying in its place in the list,
                 * so the order of the corners sent to the robot doesn't change
                 */
                const {xIsMin, yIsMin} = getScreenTopLeftEdges(transformationMatrixToScreenSpace);
                const bounds = this.getBounds();

                const xEdge = xIsMin ? bounds.maxX : bounds.minX;
                const newXEdge = dragRectangleEdge(xEdge, xIsMin ? bounds.minX : bounds.maxX, dx, currentInMapSpace.x, pixelSize);
                const yEdge = yIsMin ? bounds.maxY : bounds.minY;
                const newYEdge = dragRectangleEdge(yEdge, yIsMin ? bounds.minY : bounds.maxY, dy, currentInMapSpace.y, pixelSize);

                const onEdge = (value: number, edge: number, newEdge: number) => {
                    return value === edge ? newEdge : value;
                };

                this.x0 = onEdge(this.x0, xEdge, newXEdge);
                this.x1 = onEdge(this.x1, xEdge, newXEdge);
                this.x2 = onEdge(this.x2, xEdge, newXEdge);
                this.x3 = onEdge(this.x3, xEdge, newXEdge);

                this.y0 = onEdge(this.y0, yEdge, newYEdge);
                this.y1 = onEdge(this.y1, yEdge, newYEdge);
                this.y2 = onEdge(this.y2, yEdge, newYEdge);
                this.y3 = onEdge(this.y3, yEdge, newYEdge);

                return {
                    stopPropagation: true
                };
            } else if (isInsideBox(lastCoordinates, {topLeftBound: p0, bottomRightBound: p2})) {
                this.x0 += dx;
                this.y0 += dy;
                this.x1 += dx;
                this.y1 += dy;
                this.x2 += dx;
                this.y2 += dy;
                this.x3 += dx;
                this.y3 += dy;

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

export default RestrictedZoneClientStructure;
