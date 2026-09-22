/**
 * Camera stream manager
 */
export class CameraManager {
  constructor(videoElement) {
    this.video = videoElement;
    this.stream = null;
    this.devices = [];
    this.currentDeviceId = null;
    this.isMirrored = true;
  }

  async getDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = devices.filter(d => d.kind === 'videoinput');
      return this.devices;
    } catch (err) {
      console.warn('Could not enumerate video devices:', err);
      return [];
    }
  }

  async start(deviceId = null) {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      },
      audio: false
    };

    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
      this.currentDeviceId = deviceId;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      await this.video.play();
      await this.getDevices();
      return true;
    } catch (err) {
      console.error('Failed to open camera:', err);
      throw err;
    }
  }

  setMirrored(mirrored) {
    this.isMirrored = mirrored;
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }
}
