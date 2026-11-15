import { SimulatorEnvConfig } from '../config/env.config';

export interface FileSystemAdapter {
  readonly existsSync: (filePath: string) => boolean;
  readonly readFileSync: (filePath: string, encoding: 'utf-8') => string;
  readonly writeFileSync: (filePath: string, content: string, encoding: 'utf-8') => void;
}

export interface StorageServiceOptions {
  readonly storageFilePath: string;
  readonly envConfig: SimulatorEnvConfig;
  readonly fsAdapter: FileSystemAdapter;
}
