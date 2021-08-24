export interface CB<T> {
  (err: any, val?: T): void;
}

export interface AddListener {
  (listener: () => void): void;
}

export interface AAOLRecord {
  value: Buffer;
  offset: number;
}

export interface SSB {
  db?: {
    getIndex: CallableFunction;
    onDrain: CallableFunction;
    registerIndex: CallableFunction;
  };
}
