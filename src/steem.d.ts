declare module 'steem' {
  interface SteemApi {
    setOptions: (options: {url: string}) => void;
    [method: string]: (...args: unknown[]) => void;
  }

  const steem: {
    api: SteemApi;
    broadcast: {
      send: (
        tx: {extensions: unknown[]; operations: unknown[]},
        keys: Record<string, string>,
        callback: (error: unknown, result: unknown) => void,
      ) => void;
      _prepareTransaction: (tx: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };
    auth: {
      signTransaction: (tx: Record<string, unknown>, keys: Record<string, string>) => Record<string, unknown>;
      wifToPublic: (wif: string) => string;
      isWif: (wif: string) => boolean;
      getPrivateKeys: (name: string, password: string, roles?: string[]) => Record<string, string>;
    };
    memo: {
      encode: (privateKey: string, publicKey: string, memo: string) => string;
      decode: (privateKey: string, memo: string) => string;
    };
  };

  export default steem;
}

declare module 'steem/lib/auth/ecc/src/signature' {
  interface SteemSignature {
    toHex(): string;
  }

  const Signature: {
    sign: (message: string, privateKey: string) => SteemSignature;
  };

  export default Signature;
}
