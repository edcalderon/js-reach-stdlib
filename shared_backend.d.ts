import { ethers } from 'ethers';
declare type BigNumber = ethers.BigNumber;
export declare type num = BigNumber | number;
export declare type MaybeRep<A> = ['Some', A] | ['None', null];
export declare const asMaybe: <A>(v: A | undefined) => MaybeRep<A>;
export declare const fromSome: <A>(mo: MaybeRep<A>, da: A) => A;
export interface AnyBackendTy {
    name: string;
    canonicalize: (x: any) => any;
}
export declare const formatAssertInfo: (ai?: any) => string;
export declare const assert: (d: any, ai?: any) => void;
export declare const checkedBigNumberify: (at: string, m: BigNumber, x: any) => BigNumber;
export declare function protect(ctc: AnyBackendTy, v: unknown, ai?: unknown): any;
export declare const hexlify: typeof ethers.utils.hexlify;
export declare const isHex: typeof ethers.utils.isHexString;
export declare const stringToHex: (x: string) => string;
export declare const bytesEq: (x: any, y: any) => boolean;
export declare const bytesConcat: (x: string, y: string) => string;
export declare const eq: (a: num, b: num) => boolean;
export declare const ge: (a: num, b: num) => boolean;
export declare const gt: (a: num, b: num) => boolean;
export declare const le: (a: num, b: num) => boolean;
export declare const lt: (a: num, b: num) => boolean;
export declare function Array_set<T>(arr: Array<T>, idx: number, elem: T): Array<T>;
export declare type MapRefT<A> = (f: string) => Promise<MaybeRep<A>>;
export interface MapOpts<A> {
    ctc: {
        apiMapRef: (i: number, ty: unknown) => MapRefT<A>;
    };
    ty: unknown;
    isAPI: boolean;
    idx: number;
}
export interface LinearMap<A> {
    ref: MapRefT<A>;
    set: (f: string, v: A | undefined) => Promise<void>;
}
export declare const newMap: <A>(opts: MapOpts<A>) => LinearMap<A>;
export declare const mapSet: <A>(m: LinearMap<A>, f: string, v: A | undefined) => Promise<void>;
export declare const mapRef: <A>(m: LinearMap<A>, f: string) => Promise<MaybeRep<A>>;
export declare const Array_asyncMap: <A, B>(a: A[], f: (x: A, i: number) => Promise<B>) => Promise<B[]>;
export declare const Array_asyncReduce: <A, B>(a: A[], b: B, f: (y: B, x: A, i: number) => Promise<B>) => Promise<B>;
export declare const Array_zip: <X, Y>(x: X[], y: Y[]) => [X, Y][];
export declare const simMapDupe: <A>(sim_r: any, mapi: number, mapo: LinearMap<A>) => void;
export declare const simMapRef: <A>(sim_r: any, mapi: number, f: string) => Promise<MaybeRep<A>>;
export declare const simMapSet: <A>(sim_r: any, mapi: number, f: string, nv: A) => Promise<void>;
export declare const simTokenNew: (sim_r: any, n: any, s: any, u: any, m: any, p: any, d: any, ctr: any) => any;
export declare const simTokenBurn: (sim_r: any, tok: any, amt: any) => void;
export declare const simTokenDestroy: (sim_r: any, tok: any) => void;
export {};
//# sourceMappingURL=shared_backend.d.ts.map