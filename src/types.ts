export type Color = 'WHITE' | 'BLACK' | 'RED';
export type Orientation = 'LANDSCAPE' | 'PORTRAIT';

export interface DrawCommand {
  id: string;
  type: 'clear' | 'pixel' | 'line' | 'rect' | 'circle' | 'ellipse' | 'text' | 'image';
  color: Color;
  params: Record<string, any>;
  description: string;
}

export interface PythonFile {
  path: string;
  name: string;
  category: 'core' | 'tools' | 'tests' | 'docs';
  description: string;
  content: string;
}
