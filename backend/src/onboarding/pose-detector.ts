import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import { join } from 'path';
import { INPUT_SIZE, type Person, decode, letterbox } from './pose-geometry';

export const DEFAULT_MODEL_PATH = join(process.cwd(), 'models', 'yolov8n-pose.onnx');

/** The size of an image once its EXIF orientation is applied: orientations 5 to 8 turn it a quarter turn. */
export function orientedSize(meta: { width?: number; height?: number; orientation?: number }) {
  const turned = (meta.orientation ?? 1) >= 5;
  return turned ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height };
}

export interface PoseResult {
  width: number;
  height: number;
  people: Person[];
}

/** What the photo check needs from a pose model; the real one below, a stand-in in tests. */
export interface PoseDetecting {
  available(): Promise<boolean>;
  detect(image: Buffer): Promise<PoseResult>;
  readonly name: string;
}

/**
 * Runs a YOLO pose model (ONNX) on the server. ONNX Runtime and the image library are loaded only when first
 * needed, so an app that doesn't use the photo check never pays for them — and a machine where they can't be
 * loaded (or where the model file isn't downloaded) just reports "not available" instead of failing to start.
 *   PHOTO_CHECK_YOLO_MODEL   path to the .onnx file (default backend/models/yolov8n-pose.onnx; `npm run pose-model`)
 */
@Injectable()
export class PoseDetector implements PoseDetecting {
  private readonly logger = new Logger(PoseDetector.name);
  private session?: Promise<{ run: (input: any) => Promise<any>; Tensor: any } | null>;
  private sharp?: (input: Buffer) => any;

  constructor(private config: ConfigService) {}

  private get path() {
    return this.config.get<string>('PHOTO_CHECK_YOLO_MODEL')?.trim() || DEFAULT_MODEL_PATH;
  }

  get name() {
    return this.path.split('/').pop()!.replace(/\.onnx$/, '');
  }

  private load() {
    this.session ??= (async () => {
      if (!existsSync(this.path)) {
        this.logger.warn(`Pose model not found at ${this.path} — run "npm run pose-model" in backend`);
        return null;
      }
      try {
        const ort = await import('onnxruntime-node');
        const sharp: any = await import('sharp');
        this.sharp = sharp.default ?? sharp;
        const session = await ort.InferenceSession.create(this.path);
        return { run: (feeds: any) => session.run(feeds), Tensor: ort.Tensor };
      } catch (err) {
        this.logger.error(`Could not load the pose model: ${(err as Error).message}`);
        return null;
      }
    })();
    return this.session;
  }

  async available(): Promise<boolean> {
    return !!(await this.load());
  }

  async detect(image: Buffer): Promise<PoseResult> {
    const model = await this.load();
    if (!model || !this.sharp) throw new Error('The pose model is not available');

    // `rotate()` applies the phone's orientation tag, so a portrait photo is not read sideways. The size reported
    // is that of the file as stored, so it is turned around too for the orientations that swap the sides.
    const decoded = this.sharp(image).rotate();
    const { width, height } = orientedSize(await this.sharp(image).metadata());
    if (!width || !height) throw new Error('Could not read the image');
    const lb = letterbox(width, height);
    const pixels = await decoded
      .resize(lb.w, lb.h)
      .extend({ top: lb.padY, bottom: INPUT_SIZE - lb.h - lb.padY, left: lb.padX, right: INPUT_SIZE - lb.w - lb.padX, background: { r: 114, g: 114, b: 114 } })
      .removeAlpha()
      .raw()
      .toBuffer();

    // Interleaved RGB bytes -> planar float 0..1, the layout the model expects.
    const plane = INPUT_SIZE * INPUT_SIZE;
    const input = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      input[i] = pixels[i * 3] / 255;
      input[plane + i] = pixels[i * 3 + 1] / 255;
      input[2 * plane + i] = pixels[i * 3 + 2] / 255;
    }
    const out = (await model.run({ images: new model.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]) })).output0;
    return { width, height, people: decode(out.data as Float32Array, out.dims[2], lb) };
  }
}
