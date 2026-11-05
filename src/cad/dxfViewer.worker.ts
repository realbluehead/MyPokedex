/// <reference lib="webworker" />
/** Worker used by dxf-viewer to parse the DXF and build the scene off the main thread. */
import { DxfViewer } from 'dxf-viewer'

DxfViewer.SetupWorker()
