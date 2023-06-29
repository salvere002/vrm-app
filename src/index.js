import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMSchema, VRMUtils } from '@pixiv/three-vrm';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils'
import { Holistic, FACEMESH_TESSELATION } from '@mediapipe/holistic';
import { Face, Utils, Vector } from 'kalidokit';
import * as CameraUtils from '@mediapipe/camera_utils';
import './index.css';

const clamp = Utils.clamp;
const lerp = Vector.lerp;

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isCameraOn: true,
      isDrawingEnabled: true
    };

    this.rendererRe = React.createRef();
    this.canvasRef = React.createRef();
    this.cameraRef = React.createRef();
    this.controlsRef = React.createRef();
    this.sceneRef = React.createRef();
    this.currentVrmRef = React.createRef();
  }

  componentDidMount() {
    
    this.videoElement = document.querySelector(".input_video");
    this.guideCanvas = document.querySelector('canvas.guides');

    const renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    this.rendererRe.current = renderer;
    document.body.appendChild(renderer.domElement);

    const orbitCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    orbitCamera.position.set(0.0, 1.4, 0.7);
    this.cameraRef.current = orbitCamera;

    const orbitControls = new OrbitControls(orbitCamera, renderer.domElement);
    orbitControls.screenSpacePanning = true;
    orbitControls.target.set(0.0, 1.4, 0.0);
    orbitControls.update();
    this.controlsRef.current = orbitControls;

    const scene = new THREE.Scene();
    this.sceneRef.current = scene;

    const light = new THREE.DirectionalLight(0xafbfff);
    light.position.set(0.5, 0.5, 1.0).normalize();
    scene.add(light);

    const clock = new THREE.Clock();
    const loader = new GLTFLoader();
    loader.crossOrigin = 'anonymous';
    new Promise((resolve, reject) => {
      loader.load(
        'https://rolling-filters.s3.amazonaws.com/3d/vroid.vrm',
        (gltf) => {
          VRMUtils.removeUnnecessaryJoints(gltf.scene);
    
          VRM.from(gltf).then((vrm) => {
            scene.add(vrm.scene);
            this.currentVrmRef.current = vrm;
            this.currentVrmRef.current.scene.rotation.y = Math.PI;
            resolve(); 
          });
        },
        (progress) => {
          console.log('Loading model...', 100.0 * (progress.loaded / progress.total), '%');
        },
        (error) => {
          console.error(error);
          reject(error); 
        }
      );

      const bgTexture = new THREE.TextureLoader();
      bgTexture.load("https://images.pexels.com/photos/1205301/pexels-photo-1205301.jpeg",  function(texture)
      {
        scene.background = texture;  
       });
      
    })
    .then(() => {
      const animate = () => {
        if (!this.currentVrmRef) {
          return;
        }
        requestAnimationFrame(animate);
        if (this.currentVrmRef.current) {
          this.currentVrmRef.current.update(clock.getDelta());
        }
        renderer.render(scene, orbitCamera);
      }
      animate();
  
      
  
      const rigRotation = (name, rotation = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) => {
        if (!this.currentVrmRef.current) {
          return;
        }
        const Part = this.currentVrmRef.current.humanoid.getBoneNode(VRMSchema.HumanoidBoneName[name]);
        if (!Part) {
          return;
        }
  
        const euler = new THREE.Euler(rotation.x * dampener, rotation.y * dampener, rotation.z * dampener);
        const quaternion = new THREE.Quaternion().setFromEuler(euler);
        Part.quaternion.slerp(quaternion, lerpAmount);
      };
  
      
  
      const rigFace = (riggedFace) => {
        if (!this.currentVrmRef.current) {
          return;
        }
        rigRotation('Neck', riggedFace.head, 0.7);
  
        const Blendshape = this.currentVrmRef.current.blendShapeProxy;
        const PresetName = VRMSchema.BlendShapePresetName;
  
        riggedFace.eye.l = lerp(clamp(1 - riggedFace.eye.l, 0, 1), Blendshape.getValue(PresetName.Blink), 0.5);
        riggedFace.eye.r = lerp(clamp(1 - riggedFace.eye.r, 0, 1), Blendshape.getValue(PresetName.Blink), 0.5);
        riggedFace.eye = Face.stabilizeBlink(riggedFace.eye, riggedFace.head.y);
        Blendshape.setValue(PresetName.Blink, riggedFace.eye.l);
  
        Blendshape.setValue(PresetName.I, lerp(riggedFace.mouth.shape.I, Blendshape.getValue(PresetName.I), 0.5));
        Blendshape.setValue(PresetName.A, lerp(riggedFace.mouth.shape.A, Blendshape.getValue(PresetName.A), 0.5));
        Blendshape.setValue(PresetName.E, lerp(riggedFace.mouth.shape.E, Blendshape.getValue(PresetName.E), 0.5));
        Blendshape.setValue(PresetName.O, lerp(riggedFace.mouth.shape.O, Blendshape.getValue(PresetName.O), 0.5));
        Blendshape.setValue(PresetName.U, lerp(riggedFace.mouth.shape.U, Blendshape.getValue(PresetName.U), 0.5));
  
        let lookTarget = new THREE.Euler(
          lerp(oldLookTarget.x, riggedFace.pupil.y, 0.4),
          lerp(oldLookTarget.y, riggedFace.pupil.x, 0.4),
          0,
          'XYZ'
        );
        oldLookTarget.copy(lookTarget);
        this.currentVrmRef.current.lookAt.applyer.lookAt(lookTarget);
      };
  
      const animateVRM = (vrm, results) => {
        if (!vrm) {
          return;
        }
        let riggedFace;
  
        const faceLandmarks = results.faceLandmarks;
  
        if (faceLandmarks) {
          riggedFace = Face.solve(faceLandmarks, {
            runtime: 'mediapipe',
            video: this.videoElement,
          });
          rigFace(riggedFace);
        }
      };
  
      let oldLookTarget = new THREE.Euler();
      const onResults = (results) => {
        drawResults(results);
        this.res = results;
        animateVRM(this.currentVrmRef.current, results);
      };
  
      const drawResults = (results) => {
        if (this.state.isDrawingEnabled) {
          this.guideCanvas.width = this.videoElement.videoWidth;
          this.guideCanvas.height = this.videoElement.videoHeight;
          const canvasCtx = this.guideCanvas.getContext('2d');
          canvasCtx.save();
          canvasCtx.clearRect(0, 0, this.guideCanvas.width, this.guideCanvas.height);
          drawConnectors(canvasCtx, results.faceLandmarks, FACEMESH_TESSELATION, {
            color: '#C0C0C070',
            lineWidth: 1,
          });
          if (results.faceLandmarks && results.faceLandmarks.length === 478) {
            drawLandmarks(canvasCtx, [results.faceLandmarks[468], results.faceLandmarks[468 + 5]], {
              color: '#ffe603',
              lineWidth: 2,
            });
          }
        }
      };
  
      const holistic = new Holistic({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/${file}`;
        },
      },);
  
      holistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
        refineFaceLandmarks: true,
      });
    
      holistic.onResults(onResults);
  
      
      this.camera = new CameraUtils.Camera(this.videoElement, {
        onFrame: async () => {
          await holistic.send({ image: this.videoElement });
        },
        width: 480,
        height: 360
      });
      this.camera.start();
    })
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.isCameraOn !== this.state.isCameraOn || prevState.isDrawingEnabled !== this.state.isDrawingEnabled) {
      this.guideCanvas.width = this.videoElement.videoWidth;
      this.guideCanvas.height = this.videoElement.videoHeight;
      const canvasCtx = this.guideCanvas.getContext('2d');
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, this.guideCanvas.width, this.guideCanvas.height);
      if (this.state.isDrawingEnabled) {
      drawConnectors(canvasCtx, this.res.faceLandmarks, FACEMESH_TESSELATION, {
        color: '#C0C0C070',
        lineWidth: 1,
      });
      if (this.res.faceLandmarks && this.res.faceLandmarks.length === 478) {
        drawLandmarks(canvasCtx, [this.res.faceLandmarks[468], this.res.faceLandmarks[468 + 5]], {
          color: '#ffe603',
          lineWidth: 2,
        });
      }}
      if (this.state.isCameraOn) {
        this.camera.start();
      } else {
        this.camera.stop();
      }
    }
  }

  toggleCamera = () => {
    this.setState((prevState) => ({
      isCameraOn: !prevState.isCameraOn
    }));
  };

  toggleDrawing = () => {
    this.setState((prevState) => ({
      isDrawingEnabled: !prevState.isDrawingEnabled
    }));
  };

  render() {
    return (
      <div>
        <button onClick={this.toggleCamera} style={{ top: '10px', right: '10px' }}>
          {this.state.isCameraOn ? 'Turn camera off' : 'Turn camera on'}
        </button>
        <button onClick={this.toggleDrawing} style={{ top: '40px', right: '10px' }}>
          {this.state.isDrawingEnabled ? 'Disable Drawing' : 'Enable Drawing'}
        </button>
        <div style={{ position: "relative" }}>
          <video className="input_video" style={{ position: "absolute", top: 0, left: 0 }}/>
          <canvas className="guides" style={{ position: "absolute", top: 0, left: 0 }} />
        </div>
      </div>
    );
  }
}

ReactDOM.render(<App />, document.getElementById('root'));
