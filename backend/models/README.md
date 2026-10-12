# Pose model for the body-photo check

The onboarding photo check uses a YOLO pose model (17 body keypoints) run locally with ONNX Runtime — no photo
leaves the server, and there is no per-photo cost. The weights are **not** committed (see licence below).

```bash
cd backend && npm run pose-model   # downloads models/yolov8n-pose.onnx (~13 MB)
```

Use another file with `PHOTO_CHECK_YOLO_MODEL=/path/to/model.onnx`. Any Ultralytics-style pose export works
(input `[1,3,640,640]`, output `[1,56,8400]`).

## Licence — read before going live

Ultralytics' YOLOv8/YOLO11 models and code are **AGPL-3.0**. Running them behind a network service in a
commercial product either requires an Ultralytics Enterprise licence or publishing the corresponding source of
the service that uses them. If neither is acceptable, swap in a permissively licensed pose model
(for example RTMPose or YOLOX-pose, Apache-2.0) exported to ONNX with the same output layout, and point
`PHOTO_CHECK_YOLO_MODEL` at it.
