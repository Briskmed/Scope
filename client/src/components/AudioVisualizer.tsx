import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';

interface AudioVisualizerProps {
  audioContext: AudioContext;
  audioSource: MediaStreamAudioSourceNode;
  type?: 'bars' | 'waveform' | 'circle';
  width?: number | string;
  height?: number | string;
  isActive?: boolean;
  className?: string;
}

const Visualizer = styled.div<{ $width?: number | string; $height?: number | string }>`
  width: ${props => typeof props.$width === 'number' ? `${props.$width}px` : props.$width || '100%'};
  height: ${props => typeof props.$height === 'number' ? `${props.$height}px` : props.$height || '100px'};
  background-color: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
`;

const Canvas = styled.canvas`
  width: 100%;
  height: 100%;
  display: block;
`;

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  audioContext,
  audioSource,
  type = 'bars',
  width = '100%',
  height = 100,
  isActive = true,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode>();
  const dataArrayRef = useRef<Uint8Array>();
  const canvasCtxRef = useRef<CanvasRenderingContext2D>();

  // Initialize analyzer and data array
  useEffect(() => {
    if (!audioContext || !audioSource) return;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    audioSource.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    dataArrayRef.current = dataArray;

    return () => {
      if (analyser) {
        analyser.disconnect();
      }
    };
  }, [audioContext, audioSource]);

  // Setup canvas context
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas display size (CSS pixels)
    const updateCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      // Set the canvas drawing buffer size (actual pixels)
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      
      // Scale the context to ensure correct drawing operations
      ctx.scale(dpr, dpr);
      
      // Update the canvas CSS size
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    updateCanvasSize();
    const resizeObserver = new ResizeObserver(updateCanvasSize);
    resizeObserver.observe(canvas);

    canvasCtxRef.current = ctx;

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Draw functions
  const drawBars = (analyser: AnalyserNode, dataArray: Uint8Array, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    if (!isActive) return;

    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;
    const barWidth = (WIDTH / dataArray.length) * 2.5;
    let x = 0;

    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#4f46e5';

    for (let i = 0; i < dataArray.length; i++) {
      const barHeight = (dataArray[i] / 255) * HEIGHT;
      
      // Only draw if there's enough space for the bar
      if (x + barWidth > 0) {
        ctx.fillRect(
          x,
          HEIGHT - barHeight,
          barWidth - 1,
          barHeight
        );
      }
      
      x += barWidth + 1;
    }
  };

  const drawWaveform = (analyser: AnalyserNode, dataArray: Uint8Array, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    if (!isActive) return;

    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;
    
    analyser.getByteTimeDomainData(dataArray);
    
    ctx.fillStyle = 'rgb(0, 0, 0)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgb(79, 70, 229)';
    ctx.beginPath();
    
    const sliceWidth = WIDTH * 1.0 / dataArray.length;
    let x = 0;
    
    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * HEIGHT / 2;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      
      x += sliceWidth;
    }
    
    ctx.lineTo(WIDTH, HEIGHT / 2);
    ctx.stroke();
  };

  const drawCircle = (analyser: AnalyserNode, dataArray: Uint8Array, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    if (!isActive) return;

    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;
    const centerX = WIDTH / 2;
    const centerY = HEIGHT / 2;
    const radius = Math.min(WIDTH, HEIGHT) * 0.4;
    
    analyser.getByteFrequencyData(dataArray);
    
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    
    const barWidth = (2 * Math.PI) / dataArray.length;
    
    for (let i = 0; i < dataArray.length; i++) {
      const radians = (i / dataArray.length) * 2 * Math.PI - Math.PI / 2;
      const barHeight = (dataArray[i] / 255) * radius * 0.5;
      
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(radians);
      
      const gradient = ctx.createLinearGradient(0, 0, 0, -barHeight);
      gradient.addColorStop(0, '#4f46e5');
      gradient.addColorStop(1, '#8b5cf6');
      
      ctx.fillStyle = gradient;
      
      const barX = 0;
      const barY = -radius - barHeight;
      const barW = 2;
      
      ctx.fillRect(barX, barY, barW, barHeight);
      
      ctx.restore();
    }
  };

  // Animation loop
  useEffect(() => {
    if (!isActive || !canvasRef.current || !analyserRef.current || !dataArrayRef.current || !canvasCtxRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvasCtxRef.current;
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;

    const renderFrame = () => {
      if (!isActive) return;
      
      switch (type) {
        case 'waveform':
          drawWaveform(analyser, dataArray, canvas, ctx);
          break;
        case 'circle':
          drawCircle(analyser, dataArray, canvas, ctx);
          break;
        case 'bars':
        default:
          drawBars(analyser, dataArray, canvas, ctx);
          break;
      }
      
      animationFrameRef.current = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [type, isActive]);

  return (
    <Visualizer className={`audio-visualizer ${className || ''}`} $width={width} $height={height}>
      <Canvas ref={canvasRef} />
    </Visualizer>
  );
};

export default AudioVisualizer;
