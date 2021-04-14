// ****************************************************************************
// standard library for Javascript users
// ****************************************************************************
// XXX: do not import any types from algosdk; instead copy/paste them below
// XXX: can stop doing this workaround once @types/algosdk is shippable
import algosdk from 'algosdk';
import base32 from 'hi-base32';
import ethers from 'ethers';
import url from 'url';
import Timeout from 'await-timeout';
import buffer from 'buffer';
import msgpack from '@msgpack/msgpack';
// XXX: uncomment this import as needed for debugging in browser
// @ts-ignore
// import algosdk__src__transaction from 'algosdk/src/transaction';
const { Buffer } = buffer;
import { debug, getDEBUG, isBigNumber, bigNumberify, bigNumberToNumber, argsSlice, makeRandom } from './shared.mjs';
import waitPort from 'wait-port';
import { replaceableThunk } from './shared_impl.mjs';
import { stdlib as compiledStdlib, typeDefs } from './ALGO_compiled.mjs';
import { process, window } from './shim.mjs';
export * from './shared.mjs';
// ctc[ALGO] = {
//   address: string
//   appId: confirmedTxn.TransactionResults.CreatedAppIndex; // ?
//   creationRound: int // bigint?
//   logic_sig: LogicSig
//
//   // internal fields
//   // * not required to call acc.attach(bin, ctc)
//   // * required by backend
//   sendrecv: function
//   recv: function
// }
// ****************************************************************************
// Helpers
// ****************************************************************************
function uint8ArrayToStr(a, enc = 'utf8') {
  if (!(a instanceof Uint8Array)) {
    console.log(a);
    throw Error(`Expected Uint8Array, got ${a}`);
  }
  return Buffer.from(a).toString(enc);
}
const [getWaitPort, setWaitPort] = replaceableThunk(() => true);
export { setWaitPort };
const [getSignStrategy, setSignStrategy] = replaceableThunk(() => 'mnemonic');
export { getSignStrategy, setSignStrategy };
const [getAlgoSigner, setAlgoSigner] = replaceableThunk(async () => {
  if (window.AlgoSigner) {
    const AlgoSigner = window.AlgoSigner;
    await AlgoSigner.connect();
    return AlgoSigner;
  } else {
    // TODO: wait for a few seconds and try again before giving up
    throw Error(`Can't find AlgoSigner. Please refresh the page and try again.`);
  }
});
export { setAlgoSigner };
if (process.env.REACH_CONNECTOR_MODE == 'ALGO-browser'
  // Yes, this is dumb. TODO something better
  ||
  process.env.REACH_CONNECTOR_MODE === 'ETH-browser') {
  setWaitPort(false);
}
const rawDefaultToken = 'c87f5580d7a866317b4bfe9e8b8d1dda955636ccebfa88c12b414db208dd9705';
const rawDefaultItoken = 'reach-devnet';
async function wait1port(theServer, thePort) {
  if (!getWaitPort())
    return;
  thePort = typeof thePort === 'string' ? parseInt(thePort, 10) : thePort;
  const { hostname } = url.parse(theServer);
  const args = {
    host: hostname || undefined,
    port: thePort,
    output: 'silent',
    timeout: 1000 * 60 * 1,
  };
  debug('wait1port');
  if (getDEBUG()) {
    console.log(args);
  }
  debug('waitPort complete');
  return await waitPort(args);
}
const getLastRound = async () => (await (await getAlgodClient()).status().do())['last-round'];
const waitForConfirmation = async (txId, untilRound) => {
  const algodClient = await getAlgodClient();
  let lastRound = null;
  do {
    const lastRoundAfterCall = lastRound ?
      algodClient.statusAfterBlock(lastRound) :
      algodClient.status();
    lastRound = (await lastRoundAfterCall.do())['last-round'];
    const pendingInfo = await algodClient.pendingTransactionInformation(txId).do();
    const confirmedRound = pendingInfo['confirmed-round'];
    if (confirmedRound && confirmedRound > 0) {
      return pendingInfo;
    }
  } while (lastRound < untilRound);
  throw { type: 'waitForConfirmation', txId, untilRound, lastRound };
};
const sendAndConfirm = async (stx_or_stxs) => {
  // @ts-ignore
  let { lastRound, txID, tx } = stx_or_stxs;
  let sendme = tx;
  if (Array.isArray(stx_or_stxs)) {
    if (stx_or_stxs.length === 0) {
      debug(`Sending nothing... why...?`);
      // @ts-ignore
      return null;
    }
    debug(`Sending multiple...`);
    lastRound = stx_or_stxs[0].lastRound;
    txID = stx_or_stxs[0].txID;
    sendme = stx_or_stxs.map((stx) => stx.tx);
  }
  const untilRound = lastRound;
  const req = (await getAlgodClient()).sendRawTransaction(sendme);
  // @ts-ignore XXX
  debug(`sendAndConfirm: ${base64ify(req.txnBytesToPost)}`);
  try {
    await req.do();
  } catch (e) {
    throw { type: 'sendRawTransaction', e };
  }
  return await waitForConfirmation(txID, untilRound);
};
// Backend
const compileTEAL = async (label, code) => {
  debug(`compile ${label}`);
  let s, r;
  try {
    r = await (await getAlgodClient()).compile(code).do();
    s = 200;
  } catch (e) {
    s = typeof e === 'object' ? e.statusCode : 'not object';
    r = e;
  }
  if (s == 200) {
    debug(`compile ${label} succeeded: ${JSON.stringify(r)}`);
    r.src = code;
    r.result = new Uint8Array(Buffer.from(r.result, 'base64'));
    // debug(`compile transformed: ${JSON.stringify(r)}`);
    return r;
  } else {
    throw Error(`compile ${label} failed: ${s}: ${JSON.stringify(r)}`);
  }
};
const getTxnParams = async () => {
  debug(`fillTxn: getting params`);
  while (true) {
    const params = await (await getAlgodClient()).getTransactionParams().do();
    debug(`fillTxn: got params: ${JSON.stringify(params)}`);
    if (params.firstRound !== 0) {
      return params;
    }
    debug(`...but firstRound is 0, so let's wait and try again.`);
    // Assumption: firstRound will move past 0 on its own.
    await Timeout.set(1000);
  }
};

function regroup(thisAcc, txns) {
  // Sorry this is so dumb.
  // Basically, if these go thru AlgoSigner,
  // it will mangle them,
  //  so we need to recalculate the group hash.
  if (thisAcc.AlgoSigner) {
    const roundtrip_txns = txns
      .map(x => clean_for_AlgoSigner(x))
      .map(x => unclean_for_AlgoSigner(x));
    // console.log(`deployP: group`);
    // console.log(txns[0].group);
    // console.log(Buffer.from(txns[0].group, 'base64').toString('base64'));
    // console.log({...txns[0]});
    algosdk.assignGroupID(roundtrip_txns);
    // console.log(`deploy: roundtrip group`);
    // console.log(Buffer.from(roundtrip_txns[0].group, 'base64').toString('base64'));
    const group = roundtrip_txns[0].group;
    // The same thing, but more paranoid:
    // const group = Buffer.from(roundtrip_txns[0].group, 'base64').toString('base64');
    for (const txn of txns) {
      txn.group = group;
    }
    // console.log({...txns[0]});
    return roundtrip_txns;
  } else {
    return txns;
  }
}
// A copy/paste of some logic from AlgoSigner
// packages/extension/src/background/messaging/task.ts
function unclean_for_AlgoSigner(txnOrig) {
  const txn = { ...txnOrig };
  Object.keys({ ...txnOrig }).forEach(key => {
    if (txn[key] === undefined || txn[key] === null) {
      delete txn[key];
    }
  });
  // Modify base64 encoded fields
  if ('note' in txn && txn.note !== undefined) {
    txn.note = new Uint8Array(Buffer.from(txn.note));
  }
  // Application transactions only
  if (txn && txn.type === 'appl') {
    if ('appApprovalProgram' in txn) {
      txn.appApprovalProgram = Uint8Array.from(Buffer.from(txn.appApprovalProgram, 'base64'));
    }
    if ('appClearProgram' in txn) {
      txn.appClearProgram = Uint8Array.from(Buffer.from(txn.appClearProgram, 'base64'));
    }
    if ('appArgs' in txn) {
      var tempArgs = [];
      txn.appArgs.forEach((element) => {
        tempArgs.push(Uint8Array.from(Buffer.from(element, 'base64')));
      });
      txn.appArgs = tempArgs;
    }
  }
  // Note: this part is not copy/pasted from AlgoSigner,
  // and isn't even strictly necessary,
  // but it is nice for getting the same signatures from algosdk & AlgoSigner
  if ('group' in txn) {
    txn.group = new Uint8Array(Buffer.from(txn.group, 'base64'));
  }
  return txn;
}
const clean_for_AlgoSigner = (txnOrig) => {
  // Make a copy with just the properties, because reasons
  const txn = { ...txnOrig };
  // AlgoSigner does weird things with fees if you don't specify flatFee
  txn.flatFee = true;
  // "Creation of PaymentTx has extra or invalid fields: name,tag,appArgs."
  delete txn.name;
  delete txn.tag;
  // uncaught (in promise) lease must be a Uint8Array.
  // it is... but how about we just delete it instead
  // This is presumed safe when lease is empty
  if (txn.lease instanceof Uint8Array && txn.lease.length === 0) {
    delete txn.lease;
  } else {
    console.log(txn.lease);
    throw Error(`Impossible: non-empty lease`);
  }
  // Creation of ApplTx has extra or invalid fields: nonParticipation
  if (!txn.nonParticipation) {
    delete txn.nonParticipation;
  } else {
    throw Error(`Impossible: expected falsy nonParticipation, got: ${txn.nonParticipation}`);
  }
  // "Creation of ApplTx has extra or invalid fields: name,tag."
  if (txn.type !== 'appl') {
    delete txn.appArgs;
  } else {
    if (txn.appArgs) {
      if (txn.appArgs.length === 0) {
        txn.appArgs = [];
      } else {
        txn.appArgs = txn.appArgs.map((arg) => uint8ArrayToStr(arg, 'base64'));
      }
    }
  }
  // Validation failed for transaction because of invalid properties [from,to]
  // closeRemainderTo can cause an error w/ js-algorand-sdk addr parsing
  for (const field of ['from', 'to', 'closeRemainderTo']) {
    if (txn[field] && txn[field].publicKey) {
      txn[field] = algosdk.encodeAddress(txn[field].publicKey);
    }
  }
  // Weirdly, AlgoSigner *requires* the note to be a string
  // note is the only field that needs to be utf8-encoded, so far...
  for (const field of ['note']) {
    if (txn[field] && typeof txn[field] !== 'string') {
      txn[field] = uint8ArrayToStr(txn[field], 'utf8');
    }
  }
  // Uncaught (in promise) First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.
  // No idea what it's talking about, but probably GenesisHash?
  // And some more uint8Array BS
  for (const field of ['genesisHash', 'appApprovalProgram', 'appClearProgram', 'group']) {
    if (txn[field] && typeof txn[field] !== 'string') {
      txn[field] = uint8ArrayToStr(txn[field], 'base64');
    }
  }
  return txn;
};
const sign_and_send_sync = async (label, networkAccount, txn) => {
  const txn_s = await signTxn(networkAccount, txn);
  try {
    return await sendAndConfirm(txn_s);
  } catch (e) {
    console.log(e);
    throw Error(`${label} txn failed:\n${JSON.stringify(txn)}\nwith:\n${JSON.stringify(e)}`);
  }
};
// XXX I'd use x.replaceAll if I could (not supported in this node version), but it would be better to extend ConnectorInfo so these are functions
const replaceAll = (orig, what, whatp) => {
  const once = orig.replace(what, whatp);
  if (once === orig) {
    return orig;
  } else {
    return replaceAll(once, what, whatp);
  }
};
const replaceUint8Array = (label, arr, x) => replaceAll(x, `"{{${label}}}"`, `base32(${base32.encode(arr).toString()})`);
const replaceAddr = (label, addr, x) => replaceUint8Array(label, algosdk.decodeAddress(addr).publicKey, x);

function must_be_supported(bin) {
  const algob = bin._Connectors.ALGO;
  const { unsupported } = algob;
  if (unsupported) {
    throw Error(`This Reach application is not supported by Algorand.`);
  }
}
async function compileFor(bin, info) {
  const { ApplicationID, Deployer } = info;
  must_be_supported(bin);
  const algob = bin._Connectors.ALGO;
  const { appApproval, appClear, ctc, steps, stepargs } = algob;
  const subst_appid = (x) => replaceUint8Array('ApplicationID', T_UInt.toNet(bigNumberify(ApplicationID)), x);
  const subst_creator = (x) => replaceAddr('Deployer', Deployer, x);
  const checkLen = (label, actual, expected) => {
    if (actual > expected) {
      throw Error(`This Reach application is not supported by Algorand: ${label} length is ${actual}, but should be less than ${expected}.`);
    }
  };
  // Get these from stdlib
  const LogicSigMaxSize = 1000;
  // const MaxAppArgs = 16;
  const MaxAppTotalArgLen = 2048;
  const MaxAppProgramLen = 1024;
  const ctc_bin = await compileTEAL('ctc_subst', subst_creator(subst_appid(ctc)));
  checkLen(`Escrow Contract`, ctc_bin.result.length, LogicSigMaxSize);
  const subst_ctc = (x) => replaceAddr('ContractAddr', ctc_bin.hash, x);
  let appApproval_subst = appApproval;
  const stepCode_bin = await Promise.all(steps.map(async (mc, mi) => {
    if (!mc) {
      return null;
    }
    const mN = `m${mi}`;
    const mc_subst = subst_ctc(subst_appid(mc));
    const cr = await compileTEAL(mN, mc_subst);
    checkLen(`${mN} Contract`, cr.result.length, LogicSigMaxSize);
    // XXX check arg count
    checkLen(`${mN} Contract Arguments`, stepargs[mi], MaxAppTotalArgLen);
    appApproval_subst =
      replaceAddr(mN, cr.hash, appApproval_subst);
    return cr;
  }));
  const appApproval_bin = await compileTEAL('appApproval_subst', appApproval_subst);
  checkLen(`Approval Contract`, appApproval_bin.result.length, MaxAppProgramLen);
  const appClear_bin = await compileTEAL('appClear', appClear);
  checkLen(`Clear Contract`, appClear_bin.result.length, MaxAppProgramLen);
  return {
    appApproval: appApproval_bin,
    appClear: appClear_bin,
    ctc: ctc_bin,
    steps: stepCode_bin,
  };
}
const ui8z = new Uint8Array();
const base64ify = (x) => Buffer.from(x).toString('base64');
const format_failed_request = (e) => {
  const ep = JSON.parse(JSON.stringify(e));
  const db64 = ep.req ?
    (ep.req.data ? base64ify(ep.req.data) :
      `no data, but ${JSON.stringify(Object.keys(ep.req))}`) :
    `no req, but ${JSON.stringify(Object.keys(ep))}`;
  const msg = e.text ? JSON.parse(e.text) : e;
  return `\n${db64}\n${JSON.stringify(msg)}`;
};
const doQuery_ = async (dhead, query) => {
  debug(`${dhead} --- QUERY = ${JSON.stringify(query)}`);
  let res;
  try {
    res = await query.do();
  } catch (e) {
    throw Error(`${dhead} --- QUERY FAIL: ${JSON.stringify(e)}`);
  }
  debug(`${dhead} --- RESULT = ${JSON.stringify(res)}`);
  return res;
};
const doQuery = async (dhead, query) => {
  const res = await doQuery_(dhead, query);
  if (res.transactions.length == 0) {
    // XXX Look at the round in res and wait for a new round
    return null;
  }
  const txn = res.transactions[0];
  return txn;
};
const showBalance = async (note, networkAccount) => {
  const bal = await balanceOf({ networkAccount });
  const showBal = formatCurrency(bal, 2);
  console.log('%s: balance: %s algos', note, showBal);
};
// ****************************************************************************
// Common Interface Exports
// ****************************************************************************
export const { addressEq, digest } = compiledStdlib;
export const { T_Null, T_Bool, T_UInt, T_Tuple, T_Array, T_Object, T_Data, T_Bytes, T_Address, T_Digest, T_Struct } = typeDefs;
export const { randomUInt, hasRandom } = makeRandom(8);
// TODO: read token from scripts/algorand-devnet/algorand_data/algod.token
const [getAlgodClient, setAlgodClient] = replaceableThunk(async () => {
  debug(`Setting algod client to default`);
  const token = process.env.ALGO_TOKEN || rawDefaultToken;
  const server = process.env.ALGO_SERVER || 'http://localhost';
  const port = process.env.ALGO_PORT || '4180';
  await wait1port(server, port);
  return new algosdk.Algodv2(token, server, port);
});
export { setAlgodClient };
const [getIndexer, setIndexer] = replaceableThunk(async () => {
  debug(`setting indexer to default`);
  const itoken = process.env.ALGO_INDEXER_TOKEN || rawDefaultItoken;
  const iserver = process.env.ALGO_INDEXER_SERVER || 'http://localhost';
  const iport = process.env.ALGO_INDEXER_PORT || '8980';
  await wait1port(iserver, iport);
  return new algosdk.Indexer(itoken, iserver, iport);
});
export { setIndexer };
// eslint-disable-next-line max-len
const rawFaucetDefaultMnemonic = 'husband sock drift razor piece february loop nose crew object salon come sketch frost grocery capital young strategy catalog dial seminar sword betray absent army';
const [getFaucet, setFaucet] = replaceableThunk(async () => {
  const FAUCET = algosdk.mnemonicToSecretKey(process.env.ALGO_FAUCET_PASSPHRASE || rawFaucetDefaultMnemonic);
  return await connectAccount(FAUCET);
});
export { getFaucet, setFaucet };
export const transfer = async (from, to, value) => {
  const valuen = bigNumberToNumber(value);
  const sender = from.networkAccount;
  const receiver = to.networkAccount.addr;
  const note = algosdk.encodeObj('@reach-sh/ALGO.mjs transfer');
  return await sign_and_send_sync(`transfer ${JSON.stringify(from)} ${JSON.stringify(to)} ${valuen}`, sender, algosdk.makePaymentTxnWithSuggestedParams(sender.addr, receiver, valuen, undefined, note, await getTxnParams()));
};
async function signTxn(networkAccount, txnOrig) {
  const { sk, AlgoSigner } = networkAccount;
  if (sk && !AlgoSigner) {
    const tx = txnOrig.signTxn(sk);
    const ret = {
      tx,
      txID: txnOrig.txID().toString(),
      lastRound: txnOrig.lastRound,
    };
    return ret;
  } else if (AlgoSigner) {
    // TODO: clean up txn before signing
    const txn = clean_for_AlgoSigner(txnOrig);
    // Note: don't delete the following,
    // it is extremely useful for debugging when stuff changes wrt AlgoSigner/algosdk clashes
    // if (sk) {
    //   const re_tx = txnOrig.signTxn ? txnOrig : new algosdk__src__transaction.Transaction(txnOrig);
    //   re_tx.group = txnOrig.group;
    //   const sk_tx = re_tx.signTxn(sk);
    //   const sk_ret = {
    //     tx: sk_tx,
    //     txID: re_tx.txID().toString(),
    //     lastRound: txnOrig.lastRound,
    //   };
    //   console.log('signed sk_ret');
    //   console.log({txID: sk_ret.txID});
    //   console.log(msgpack.decode(sk_ret.tx));
    // }
    debug('AlgoSigner.sign ...');
    const stx_obj = await AlgoSigner.sign(txn);
    debug('...signed');
    debug({ stx_obj });
    const ret = {
      tx: Buffer.from(stx_obj.blob, 'base64'),
      txID: stx_obj.txID,
      lastRound: txnOrig.lastRound,
    };
    // XXX switch debug to console.log for nicer browser output
    debug('signed AlgoSigner');
    debug({ txID: ret.txID });
    debug(msgpack.decode(ret.tx));
    return ret;
  } else {
    throw Error(`networkAccount has neither sk nor AlgoSigner: ${JSON.stringify(networkAccount)}`);
  }
}
export const connectAccount = async (networkAccount) => {
  const indexer = await getIndexer();
  const thisAcc = networkAccount;
  const shad = thisAcc.addr.substring(2, 6);
  let label = shad;
  const pks = T_Address.canonicalize(thisAcc);
  debug(`${shad}: connectAccount`);
  const selfAddress = () => {
    return pks;
  };
  const iam = (some_addr) => {
    if (some_addr === pks) {
      return some_addr;
    } else {
      throw Error(`I should be ${some_addr}, but am ${pks}`);
    }
  };
  const attachP = async (bin, ctcInfoP) => {
    const ctcInfo = await ctcInfoP;
    const getInfo = async () => ctcInfo;
    const { Deployer, ApplicationID } = ctcInfo;
    let lastRound = ctcInfo.creationRound;
    debug(`${shad}: attach ${ApplicationID} created at ${lastRound}`);
    const bin_comp = await compileFor(bin, ctcInfo);
    await verifyContract(ctcInfo, bin);
    const ctc_prog = algosdk.makeLogicSig(bin_comp.ctc.result, []);
    const wait = async (delta) => {
      return await waitUntilTime(bigNumberify(lastRound).add(delta));
    };
    const sendrecv = async (funcNum, evt_cnt, hasLastTime, tys, args, value, out_tys, onlyIf, soloSend, timeout_delay, sim_p) => {
      if (hasLastTime !== false) {
        const ltidx = hasLastTime.toNumber();
        tys.splice(ltidx, 1);
        args.splice(ltidx, 1);
      }
      const doRecv = async (waitIfNotPresent) => await recv(funcNum, evt_cnt, out_tys, waitIfNotPresent, timeout_delay);
      if (!onlyIf) {
        return await doRecv(true);
      }
      const funcName = `m${funcNum}`;
      const dhead = `${shad}: ${label} sendrecv ${funcName} ${timeout_delay}`;
      debug(`${dhead} --- START`);
      const handler = bin_comp.steps[funcNum];
      if (!handler) {
        throw Error(`${dhead} Internal error: reference to undefined handler: ${funcName}`);
      }
      const fake_res = {
        didTimeout: false,
        data: argsSlice(args, evt_cnt),
        time: bigNumberify(0),
        value: value,
        from: pks,
        getOutput: (async (o_lab, o_ctc) => {
          void(o_lab);
          void(o_ctc);
          throw Error(`Algorand does not support remote calls`);
        }),
      };
      const sim_r = await sim_p(fake_res);
      debug(`${dhead} --- SIMULATE ${JSON.stringify(sim_r)}`);
      const isHalt = sim_r.isHalt;
      const sim_txns = sim_r.txns;
      while (true) {
        const params = await getTxnParams();
        if (timeout_delay) {
          // This 1000 is MaxTxnLife --- https://github.com/algorand/go-algorand/blob/master/config/consensus.go#L560
          const tdn = Math.min(1000, timeout_delay.toNumber());
          params.lastRound = lastRound + tdn;
          if (params.firstRound > params.lastRound) {
            debug(`${dhead} --- FAIL/TIMEOUT`);
            return { didTimeout: true };
          }
        }
        debug(`${dhead} --- ASSEMBLE w/ ${JSON.stringify(params)}`);
        const txnFromContracts = sim_txns.map((txn_nfo) => algosdk.makePaymentTxnWithSuggestedParams(bin_comp.ctc.hash,
          // XXX use some other function
          algosdk.encodeAddress(Buffer.from(txn_nfo.to.slice(2), 'hex')), txn_nfo.amt.toNumber(), undefined, ui8z, params));
        if (isHalt) {
          txnFromContracts.push(algosdk.makePaymentTxnWithSuggestedParams(bin_comp.ctc.hash, Deployer, 0, Deployer, ui8z, params));
        }
        const totalFromFee = txnFromContracts.reduce(((sum, txn) => sum + txn.fee), 0);
        debug(`${dhead} --- totalFromFee = ${JSON.stringify(totalFromFee)}`);
        debug(`${dhead} --- isHalt = ${JSON.stringify(isHalt)}`);
        const actual_args = [sim_r.prevSt_noPrevTime, sim_r.nextSt_noTime, isHalt, bigNumberify(totalFromFee), lastRound, ...args];
        const actual_tys = [T_Digest, T_Digest, T_Bool, T_UInt, T_UInt, ...tys];
        debug(`${dhead} --- ARGS = ${JSON.stringify(actual_args)}`);
        const safe_args = actual_args.map((m, i) => actual_tys[i].toNet(m));
        safe_args.forEach((x) => {
          if (!(x instanceof Uint8Array)) {
            // The types say this is impossible now,
            // but we'll leave it in for a while just in case...
            throw Error(`expect safe program argument, got ${JSON.stringify(x)}`);
          }
        });
        const ui8h = (x) => Buffer.from(x).toString('hex');
        debug(`${dhead} --- PREPARE: ${JSON.stringify(safe_args.map(ui8h))}`);
        const handler_sig = algosdk.makeLogicSig(handler.result, []);
        debug(`${dhead} --- PREPARED`);
        const whichAppl = isHalt ?
          // We are treating it like any party can delete the application, but the docs say it may only be possible for the creator. The code appears to not care: https://github.com/algorand/go-algorand/blob/0e9cc6b0c2ddc43c3cfa751d61c1321d8707c0da/ledger/apply/application.go#L589
          algosdk.makeApplicationDeleteTxn :
          algosdk.makeApplicationNoOpTxn;
        // XXX if it is a halt, generate closeremaindertos for all the handlers and the contract account
        const txnAppl = whichAppl(thisAcc.addr, params, ApplicationID, safe_args);
        const txnFromHandler = algosdk.makePaymentTxnWithSuggestedParams(handler.hash, thisAcc.addr, 0, thisAcc.addr, ui8z, params);
        debug(`${dhead} --- txnFromHandler = ${JSON.stringify(txnFromHandler)}`);
        const txnToHandler = algosdk.makePaymentTxnWithSuggestedParams(thisAcc.addr, handler.hash, txnFromHandler.fee + raw_minimumBalance, undefined, ui8z, params);
        debug(`${dhead} --- txnToHandler = ${JSON.stringify(txnToHandler)}`);
        const txnToContract = algosdk.makePaymentTxnWithSuggestedParams(thisAcc.addr, bin_comp.ctc.hash, value.toNumber() + totalFromFee, undefined, ui8z, params);
        const txns = [
          txnAppl,
          txnToHandler,
          txnFromHandler,
          txnToContract,
          ...txnFromContracts,
        ];
        algosdk.assignGroupID(txns);
        regroup(thisAcc, txns);
        const signLSTO = (txn, ls) => {
          const tx_obj = algosdk.signLogicSigTransactionObject(txn, ls);
          return {
            tx: tx_obj.blob,
            txID: tx_obj.txID,
            lastRound: txn.lastRound,
          };
        };
        const sign_me = async (x) => await signTxn(thisAcc, x);
        const txnAppl_s = await sign_me(txnAppl);
        const txnFromHandler_s = signLSTO(txnFromHandler, handler_sig);
        // debug(`txnFromHandler_s: ${base64ify(txnFromHandler_s)}`);
        const txnToHandler_s = await sign_me(txnToHandler);
        const txnToContract_s = await sign_me(txnToContract);
        const txnFromContracts_s = txnFromContracts.map((txn) => signLSTO(txn, ctc_prog));
        const txns_s = [
          txnAppl_s,
          txnToHandler_s,
          txnFromHandler_s,
          txnToContract_s,
          ...txnFromContracts_s,
        ];
        debug(`${dhead} --- SEND: ${txns_s.length}`);
        let res;
        try {
          res = await sendAndConfirm(txns_s);
          // XXX we should inspect res and if we failed because we didn't get picked out of the queue, then we shouldn't error, but should retry and let the timeout logic happen.
          debug(`${dhead} --- SUCCESS: ${JSON.stringify(res)}`);
        } catch (e) {
          const handle_error = (!soloSend) ? debug : ((x) => { throw Error(x); });
          if (e.type == 'sendRawTransaction') {
            handle_error(`${dhead} --- FAIL:\n${format_failed_request(e.e)}`);
          } else {
            handle_error(`${dhead} --- FAIL:\n${JSON.stringify(e)}`);
          }
        }
        return await doRecv(false);
      }
    };
    const recv = async (funcNum, evt_cnt, tys, waitIfNotPresent, timeout_delay) => {
      // Ignoring this, because no ALGO dev node
      void(waitIfNotPresent);
      const funcName = `m${funcNum}`;
      const dhead = `${shad}: ${label} recv ${funcName} ${timeout_delay}`;
      debug(`${dhead} --- START`);
      const handler = bin_comp.steps[funcNum];
      if (!handler) {
        throw Error(`${dhead} Internal error: reference to undefined handler: ${funcName}`);
      }
      const timeoutRound = timeout_delay ?
        lastRound + timeout_delay.toNumber() :
        undefined;
      while (true) {
        const currentRound = await getLastRound();
        if (timeoutRound && timeoutRound < currentRound) {
          return { didTimeout: true };
        }
        let hquery = indexer.searchForTransactions()
          .address(handler.hash)
          .addressRole('sender')
          // Look at the next one after the last message
          // XXX when we implement firstMsg, this won't work on the first
          // message
          .minRound(lastRound + 1);
        if (timeoutRound) {
          hquery = hquery.maxRound(timeoutRound);
        }
        const htxn = await doQuery(dhead, hquery);
        if (!htxn) {
          // XXX perhaps wait until a new round has happened using wait
          await Timeout.set(2000);
          continue;
        }
        debug(`${dhead} --- htxn = ${JSON.stringify(htxn)}`);
        const theRound = htxn['confirmed-round'];
        let query = indexer.searchForTransactions()
          .applicationID(ApplicationID)
          .txType('appl')
          .round(theRound);
        const txn = await doQuery(dhead, query);
        if (!txn) {
          // XXX This is probably really bad
          continue;
        }
        debug(`${dhead} --- txn = ${JSON.stringify(txn)}`);
        const ctc_args = txn['application-transaction']['application-args'];
        debug(`${dhead} --- ctc_args = ${JSON.stringify(ctc_args)}`);
        const args = argsSlice(ctc_args, evt_cnt);
        debug(`${dhead} --- args = ${JSON.stringify(args)}`);
        /** @description base64->hex->arrayify */
        const reNetify = (x) => {
          const s = Buffer.from(x, 'base64').toString('hex');
          debug(`${dhead} --- reNetify(${x}) = ${s}`);
          return ethers.utils.arrayify('0x' + s);
        };
        debug(`${dhead} --- tys = ${JSON.stringify(tys)}`);
        const args_un = args.map((x, i) => tys[i].fromNet(reNetify(x)));
        debug(`${dhead} --- args_un = ${JSON.stringify(args_un)}`);
        const totalFromFee = T_UInt.fromNet(reNetify(ctc_args[3]));
        debug(`${dhead} --- totalFromFee = ${JSON.stringify(totalFromFee)}`);
        const fromAddr = htxn['payment-transaction'].receiver;
        const from = T_Address.canonicalize({ addr: fromAddr });
        debug(`${dhead} --- from = ${JSON.stringify(from)} = ${fromAddr}`);
        const oldLastRound = lastRound;
        lastRound = theRound;
        debug(`${dhead} --- updating round from ${oldLastRound} to ${lastRound}`);
        // XXX ideally we'd get the whole transaction group before and not need to do this.
        const ptxn = await doQuery(dhead, indexer.searchForTransactions()
          .address(bin_comp.ctc.hash)
          .addressRole('receiver')
          .round(theRound));
        const value = bigNumberify(ptxn['payment-transaction'].amount)
          .sub(totalFromFee);
        debug(`${dhead} --- value = ${JSON.stringify(value)}`);
        const getOutput = (o_lab, o_ctc) => {
          void(o_lab);
          void(o_ctc);
          throw Error(`Algorand does not support remote calls`);
        };
        return {
          didTimeout: false,
          data: args_un,
          time: bigNumberify(lastRound),
          value,
          from,
          getOutput,
        };
      }
    };
    const creationTime = async () => bigNumberify((await getInfo()).creationRound);
    return { getInfo, creationTime, sendrecv, recv, iam, selfAddress, wait, stdlib: compiledStdlib };
  };
  const deployP = async (bin) => {
    must_be_supported(bin);
    debug(`${shad} deploy`);
    const algob = bin._Connectors.ALGO;
    const { appApproval0, appClear } = algob;
    const Deployer = thisAcc.addr;
    const appApproval0_subst = replaceAddr('Deployer', Deployer, appApproval0);
    const appApproval0_bin = await compileTEAL('appApproval0', appApproval0_subst);
    const appClear_bin = await compileTEAL('appClear', appClear);
    const createRes = await sign_and_send_sync('ApplicationCreate', thisAcc, algosdk.makeApplicationCreateTxn(thisAcc.addr, await getTxnParams(), algosdk.OnApplicationComplete.NoOpOC, appApproval0_bin.result, appClear_bin.result, 0, 0, 2, 1));
    const ApplicationID = createRes['application-index'];
    if (!ApplicationID) {
      throw Error(`No application-index in ${JSON.stringify(createRes)}`);
    }
    const bin_comp = await compileFor(bin, { ApplicationID, Deployer, creationRound: 0 });
    const params = await getTxnParams();
    const txnUpdate = algosdk.makeApplicationUpdateTxn(thisAcc.addr, params, ApplicationID, bin_comp.appApproval.result, appClear_bin.result);
    const txnToContract = algosdk.makePaymentTxnWithSuggestedParams(thisAcc.addr, bin_comp.ctc.hash, raw_minimumBalance, undefined, ui8z, params);
    const txns = [
      txnUpdate,
      txnToContract,
    ];
    algosdk.assignGroupID(txns);
    regroup(thisAcc, txns);
    const txnUpdate_s = await signTxn(thisAcc, txnUpdate);
    const txnToContract_s = await signTxn(thisAcc, txnToContract);
    const txns_s = [
      txnUpdate_s,
      txnToContract_s,
    ];
    let updateRes;
    try {
      updateRes = await sendAndConfirm(txns_s);
    } catch (e) {
      throw Error(`deploy: ${JSON.stringify(e)}`);
    }
    const creationRound = updateRes['confirmed-round'];
    const getInfo = async () => ({ ApplicationID, creationRound, Deployer });
    debug(`${shad} application created`);
    return await attachP(bin, getInfo());
  };
  /**
   * @description Push await down into the functions of a ContractAttached
   * @param implP A promise of an implementation of ContractAttached
   */
  const deferP = (implP) => {
    return {
      getInfo: async () => (await implP).getInfo(),
      creationTime: async () => (await implP).creationTime(),
      sendrecv: async (...args) => (await implP).sendrecv(...args),
      recv: async (...args) => (await implP).recv(...args),
      wait: async (...args) => (await implP).wait(...args),
      iam,
      selfAddress,
      stdlib: compiledStdlib,
    };
  };
  const attach = (bin, ctcInfoP) => {
    return deferP(attachP(bin, ctcInfoP));
  };
  const deploy = (bin) => {
    return deferP(deployP(bin));
  };

  function setDebugLabel(newLabel) {
    label = newLabel;
    // @ts-ignore
    return this;
  }
  return { deploy, attach, networkAccount, getAddress: selfAddress, stdlib: compiledStdlib, setDebugLabel };
};
export const balanceOf = async (acc) => {
  const { networkAccount } = acc;
  if (!networkAccount)
    throw Error(`acc.networkAccount missing. Got: ${acc}`);
  const client = await getAlgodClient();
  const { amount } = await client.accountInformation(networkAccount.addr).do();
  return bigNumberify(amount);
};
export const createAccount = async () => {
  const networkAccount = algosdk.generateAccount();
  return await connectAccount(networkAccount);
};
export const fundFromFaucet = async (account, value) => {
  const faucet = await getFaucet();
  await transfer(faucet, account, value);
};
export const newTestAccount = async (startingBalance) => {
  const account = await createAccount();
  if (getDEBUG()) {
    await showBalance('before', account.networkAccount);
  }
  await fundFromFaucet(account, startingBalance);
  if (getDEBUG()) {
    await showBalance('after', account.networkAccount);
  }
  return account;
};
/** @description the display name of the standard unit of currency for the network */
export const standardUnit = 'ALGO';
/** @description the display name of the atomic (smallest) unit of currency for the network */
export const atomicUnit = 'μALGO';
/**
 * @description  Parse currency by network
 * @param amt  value in the {@link standardUnit} for the network.
 * @returns  the amount in the {@link atomicUnit} of the network.
 * @example  parseCurrency(100).toString() // => '100000000'
 */
export function parseCurrency(amt) {
  const numericAmt = isBigNumber(amt) ? amt.toNumber() :
    typeof amt === 'string' ? parseFloat(amt) :
    amt;
  return bigNumberify(algosdk.algosToMicroalgos(numericAmt));
}
// XXX get from SDK
const raw_minimumBalance = 100000;
export const minimumBalance = bigNumberify(raw_minimumBalance);
/**
 * @description  Format currency by network
 * @param amt  the amount in the {@link atomicUnit} of the network.
 * @param decimals  up to how many decimal places to display in the {@link standardUnit}.
 *   Trailing zeroes will be omitted. Excess decimal places will be truncated. (not rounded)
 *   This argument defaults to maximum precision.
 * @returns  a string representation of that amount in the {@link standardUnit} for that network.
 * @example  formatCurrency(bigNumberify('100000000')); // => '100'
 */
export function formatCurrency(amt, decimals = 6) {
  // Recall that 1 algo = 10^6 microalgos
  if (!(Number.isInteger(decimals) && 0 <= decimals)) {
    throw Error(`Expected decimals to be a nonnegative integer, but got ${decimals}.`);
  }
  // Use decimals+1 and then slice it off to truncate instead of round
  const algosStr = algosdk
    .microalgosToAlgos(bigNumberify(amt).toNumber())
    .toFixed(decimals + 1);
  // Have to roundtrip thru Number to drop trailing zeroes
  return Number(algosStr.slice(0, algosStr.length - 1)).toString();
}
// XXX The getDefaultAccount pattern doesn't really work w/ AlgoSigner
// AlgoSigner does not expose a "currently-selected account"
export async function getDefaultAccount() {
  if (!window.prompt) {
    throw Error(`Cannot prompt the user for default account with window.prompt`);
  }
  const signStrategy = getSignStrategy();
  if (signStrategy === 'mnemonic') {
    const mnemonic = window.prompt(`Please paste the mnemonic for your account, or cancel to generate a new one`);
    if (mnemonic) {
      debug(`Creating account from user-provided mnemonic`);
      return await newAccountFromMnemonic(mnemonic);
    } else {
      debug(`No mnemonic provided. Randomly generating a new account secret instead.`);
      return await createAccount();
    }
  } else if (signStrategy === 'AlgoSigner') {
    const ledger = 'Reach Devnet'; // XXX decide how to support other ledgers
    const AlgoSigner = await getAlgoSigner();
    const addr = window.prompt(`Please paste your account's address. (This account must be listed in AlgoSigner.)`);
    if (!addr) {
      throw Error(`No address provided`);
    }
    return await newAccountFromAlgoSigner(addr, AlgoSigner, ledger);
  } else if (signStrategy === 'MyAlgo') {
    throw Error(`MyAlgo wallet support is not yet implemented`);
  } else {
    throw Error(`signStrategy '${signStrategy}' not recognized. Valid options are 'mnemonic', 'AlgoSigner', and 'MyAlgo'.`);
  }
}
/**
 * @param mnemonic 25 words, space-separated
 */
export const newAccountFromMnemonic = async (mnemonic) => {
  return await connectAccount(algosdk.mnemonicToSecretKey(mnemonic));
};
/**
 * @param secret a Uint8Array, or its hex string representation
 */
export const newAccountFromSecret = async (secret) => {
  const sk = ethers.utils.arrayify(secret);
  const mnemonic = algosdk.secretKeyToMnemonic(sk);
  return await newAccountFromMnemonic(mnemonic);
};
export const newAccountFromAlgoSigner = async (addr, AlgoSigner, ledger) => {
  if (!AlgoSigner) {
    throw Error(`AlgoSigner is falsy`);
  }
  const accts = await AlgoSigner.accounts({ ledger });
  if (!Array.isArray(accts)) {
    throw Error(`AlgoSigner.accounts('${ledger}') is not an array: ${accts}`);
  }
  if (!accts.map(x => x.address).includes(addr)) {
    throw Error(`Address ${addr} not found in AlgoSigner accounts`);
  }
  let networkAccount = { addr, AlgoSigner };
  return await connectAccount(networkAccount);
};
export const getNetworkTime = async () => bigNumberify(await getLastRound());
export const waitUntilTime = async (targetTime, onProgress) => {
  const onProg = onProgress || (() => {});
  let currentTime = await getNetworkTime();
  while (currentTime.lt(targetTime)) {
    debug(`waitUntilTime: iteration: ${currentTime} -> ${targetTime}`);
    const status = await (await getAlgodClient()).statusAfterBlock(currentTime.toNumber()).do();
    currentTime = bigNumberify(status['last-round']);
    onProg({ currentTime, targetTime });
  }
  debug(`waitUntilTime: ended: ${currentTime} -> ${targetTime}`);
  return currentTime;
};
export const wait = async (delta, onProgress) => {
  const now = await getNetworkTime();
  debug(`wait: delta=${delta} now=${now}, until=${now.add(delta)}`);
  return await waitUntilTime(now.add(delta), onProgress);
};
export const verifyContract = async (info, bin) => {
  const { ApplicationID, Deployer, creationRound } = info;
  const compiled = await compileFor(bin, info);
  const { appApproval, appClear } = compiled;
  let dhead = `verifyContract`;
  const chk = (p, msg) => {
    if (!p) {
      throw Error(`verifyContract failed: ${msg}`);
    }
  };
  const chkeq = (a, e, msg) => {
    const as = JSON.stringify(a);
    const es = JSON.stringify(e);
    chk(as === es, `${msg}: expected ${es}, got ${as}`);
  };
  const client = await getAlgodClient();
  const appInfo = await client.getApplicationByID(ApplicationID).do();
  const appInfo_p = appInfo['params'];
  debug(`${dhead} -- appInfo_p = ${JSON.stringify(appInfo_p)}`);
  const indexer = await getIndexer();
  const cquery = indexer.searchForTransactions()
    .applicationID(ApplicationID)
    .txType('appl')
    .round(creationRound);
  let ctxn = null;
  while (!ctxn) {
    const cres = await doQuery_(dhead, cquery);
    if (cres['current-round'] < creationRound) {
      debug(`${dhead} -- waiting for creationRound`);
      await Timeout.set(1000);
      continue;
    }
    ctxn = cres.transactions[0];
  }
  debug(`${dhead} -- ctxn = ${JSON.stringify(ctxn)}`);
  const fmtp = (x) => uint8ArrayToStr(x.result, 'base64');
  chk(ctxn, `Cannot query for creationRound accuracy`);
  chk(appInfo_p, `Cannot lookup ApplicationId`);
  chkeq(appInfo_p['approval-program'], fmtp(appApproval), `Approval program does not match Reach backend`);
  chkeq(appInfo_p['clear-state-program'], fmtp(appClear), `ClearState program does not match Reach backend`);
  chkeq(appInfo_p['creator'], Deployer, `Deployer does not match contract information`);
  const catxn = ctxn['application-transaction'];
  chkeq(catxn['approval-program'], appInfo_p['approval-program'], `creationRound Approval program`);
  chkeq(catxn['clear-state-program'], appInfo_p['clear-state-program'], `creationRound ClearState program`);
  chkeq(catxn['on-completion'], 'update', `creationRound on-completion`);
  chkeq(ctxn['sender'], Deployer, `creationRound Deployer`);
  // Note: (after deployMode:firstMsg is implemented)
  // 1. (above) attach initial args to ContractInfo
  // 2. verify contract storage matches expectations based on initial args
  return true;
};
export const reachStdlib = compiledStdlib;
