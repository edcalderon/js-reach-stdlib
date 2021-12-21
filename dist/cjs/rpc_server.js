"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
exports.__esModule = true;
exports.serveRpc = exports.mkStdlibProxy = exports.mkKont = void 0;
var http2_1 = require("http2");
var crypto_1 = require("crypto");
var fs_1 = require("fs");
var path_1 = require("path");
var express_1 = __importDefault(require("express"));
var loader_1 = require("./loader");
var shared_impl_1 = require("./shared_impl");
var withApiKey = function () {
    var key = process.env.REACH_RPC_KEY;
    if (!key) {
        console.error(['\nPlease populate the `REACH_RPC_KEY` environment variable with a',
            ' strong pre-shared key, e.g.:\n',
            '  $ head -c 24 /dev/urandom | base64\n'
        ].join(''));
        process.exit(1);
    }
    return function (req, res, next) {
        return req.get('X-API-Key') === key
            ? next()
            : res.status(403).json({});
    };
};
var mkKont = function () {
    // TODO consider replacing stringly-typed exceptions with structured
    // descendants of `Error` base class
    var UNTRACKED = 'Untracked continuation ID:';
    var untracked = function (i) { return UNTRACKED + " " + i; };
    var k = {};
    var i = 0;
    var mkWas = function (m) { return function (e) {
        return !!(e.message
            .substr(0, m.length)
            .match("^" + m + "$"));
    }; };
    var was = {
        untracked: mkWas(UNTRACKED)
    };
    var raise = function (e) {
        throw new Error(e);
    };
    var track = function (a) { return __awaiter(void 0, void 0, void 0, function () {
        var rb, id;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, crypto_1.randomBytes)(24)];
                case 1:
                    rb = _a.sent();
                    id = i + "_" + rb.toString('hex');
                    k[id] = a;
                    i++;
                    return [2 /*return*/, id];
            }
        });
    }); };
    var id = function (i) {
        return k[i] === undefined
            ? raise(untracked(i))
            : k[i];
    };
    var replace = function (i, a) {
        return k[i] === undefined
            ? raise(untracked(i))
            : (function () { k[i] = a; return i; })();
    };
    var forget = function (i) {
        return delete k[i];
    };
    return {
        // Internals
        _: {
            k: k,
            i: i,
            UNTRACKED: UNTRACKED,
            untracked: untracked
        },
        // General API
        forget: forget,
        id: id,
        replace: replace,
        track: track,
        was: was
    };
};
exports.mkKont = mkKont;
var mkStdlibProxy = function (lib, ks) { return __awaiter(void 0, void 0, void 0, function () {
    var account, token;
    return __generator(this, function (_a) {
        account = ks.account, token = ks.token;
        return [2 /*return*/, __assign(__assign({}, lib), { newTestAccount: function (bal) { return __awaiter(void 0, void 0, void 0, function () { var _a, _b; return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            _b = (_a = account).track;
                            return [4 /*yield*/, lib.newTestAccount(bal)];
                        case 1: return [2 /*return*/, _b.apply(_a, [_c.sent()])];
                    }
                }); }); }, newTestAccounts: function (num, bal) { return __awaiter(void 0, void 0, void 0, function () { var _a, _b; return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            _b = (_a = Promise).all;
                            return [4 /*yield*/, lib.newTestAccounts(num, bal)];
                        case 1: return [2 /*return*/, _b.apply(_a, [(_c.sent()).map(account.track)])];
                    }
                }); }); }, getDefaultAccount: function () { return __awaiter(void 0, void 0, void 0, function () { var _a, _b; return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            _b = (_a = account).track;
                            return [4 /*yield*/, lib.getDefaultAccount()];
                        case 1: return [2 /*return*/, _b.apply(_a, [_c.sent()])];
                    }
                }); }); }, newAccountFromSecret: function (s) { return __awaiter(void 0, void 0, void 0, function () { var _a, _b; return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            _b = (_a = account).track;
                            return [4 /*yield*/, lib.newAccountFromSecret(s)];
                        case 1: return [2 /*return*/, _b.apply(_a, [_c.sent()])];
                    }
                }); }); }, newAccountFromMnemonic: function (s) { return __awaiter(void 0, void 0, void 0, function () { var _a, _b; return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            _b = (_a = account).track;
                            return [4 /*yield*/, lib.newAccountFromMnemonic(s)];
                        case 1: return [2 /*return*/, _b.apply(_a, [_c.sent()])];
                    }
                }); }); }, createAccount: function () { return __awaiter(void 0, void 0, void 0, function () { var _a, _b; return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            _b = (_a = account).track;
                            return [4 /*yield*/, lib.createAccount()];
                        case 1: return [2 /*return*/, _b.apply(_a, [_c.sent()])];
                    }
                }); }); }, fundFromFaucet: function (id, bal) {
                    return lib.fundFromFaucet(account.id(id), bal);
                }, connectAccount: function (id) { return __awaiter(void 0, void 0, void 0, function () { var _a, _b; return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            _b = (_a = account).track;
                            return [4 /*yield*/, lib.connectAccount(account.id(id).networkAccount)];
                        case 1: return [2 /*return*/, _b.apply(_a, [_c.sent()])];
                    }
                }); }); }, balanceOf: function (id, token) { return __awaiter(void 0, void 0, void 0, function () {
                    var t;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                t = token === undefined ? undefined
                                    : token.id ? token.id // From `launchToken`
                                        : token;
                                return [4 /*yield*/, lib.balanceOf(account.id(id), t)];
                            case 1: return [2 /*return*/, _a.sent()];
                        }
                    });
                }); }, transfer: function (from, to, bal) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                    return [2 /*return*/, lib.transfer(account.id(from), account.id(to), bal)];
                }); }); }, assert: function (x) {
                    return lib.assert(x);
                }, 
                // As of 2021-12-08 `launchToken` isn't officially documented
                // These are unlike `Token` values but we'll track them together, with the
                // intention that functions like `tokenAccept` should accept either
                launchToken: function (id, name, sym, opts) {
                    if (opts === void 0) { opts = {}; }
                    return __awaiter(void 0, void 0, void 0, function () {
                        var t;
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0: return [4 /*yield*/, lib.launchToken(account.id(id), name, sym, opts)];
                                case 1:
                                    t = _b.sent();
                                    _a = {};
                                    return [4 /*yield*/, token.track(t)];
                                case 2: return [2 /*return*/, (_a.kid = _b.sent(), _a.token = t, _a)];
                            }
                        });
                    });
                }, setQueryLowerBound: function (nt) {
                    return lib.setQueryLowerBound(lib.bigNumberify(nt));
                } })];
    });
}); };
exports.mkStdlibProxy = mkStdlibProxy;
var serveRpc = function (backend) { return __awaiter(void 0, void 0, void 0, function () {
    var account, contract, token, kont, real_stdlib, rpc_stdlib, app, route_backend, reBigNumberify, rpc_acc, rpc_ctc, rpc_launchToken, safely, mkRPC, userDefinedField, mkUserDefined, ctcPs, _loop_1, b, do_kont, mkForget, p, fetchOrFail, opts, passphrase;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                account = (0, exports.mkKont)();
                contract = (0, exports.mkKont)();
                token = (0, exports.mkKont)();
                kont = (0, exports.mkKont)();
                return [4 /*yield*/, (0, loader_1.loadStdlib)()];
            case 1:
                real_stdlib = _a.sent();
                return [4 /*yield*/, (0, exports.mkStdlibProxy)(real_stdlib, { account: account, token: token })];
            case 2:
                rpc_stdlib = _a.sent();
                app = (0, express_1["default"])();
                route_backend = express_1["default"].Router();
                reBigNumberify = function (n) {
                    return n && n.hex && n.type && n.type === 'BigNumber'
                        ? (function () { try {
                            return real_stdlib.bigNumberify(n);
                        }
                        catch (e) {
                            return n;
                        } })()
                        : n;
                };
                rpc_acc = {
                    contract: function (id) {
                        var args = [];
                        for (var _i = 1; _i < arguments.length; _i++) {
                            args[_i - 1] = arguments[_i];
                        }
                        return __awaiter(void 0, void 0, void 0, function () {
                            var _a, _b;
                            var _c;
                            return __generator(this, function (_d) {
                                switch (_d.label) {
                                    case 0:
                                        _b = (_a = contract).track;
                                        return [4 /*yield*/, (_c = account.id(id)).contract.apply(_c, __spreadArray([backend], args, false))];
                                    case 1: return [2 /*return*/, _b.apply(_a, [_d.sent()])];
                                }
                            });
                        });
                    },
                    attach: function (id) {
                        var args = [];
                        for (var _i = 1; _i < arguments.length; _i++) {
                            args[_i - 1] = arguments[_i];
                        }
                        return __awaiter(void 0, void 0, void 0, function () {
                            var _a, _b;
                            var _c;
                            return __generator(this, function (_d) {
                                switch (_d.label) {
                                    case 0:
                                        _b = (_a = contract).track;
                                        return [4 /*yield*/, (_c = account.id(id)).attach.apply(_c, __spreadArray([backend], args, false))];
                                    case 1: return [2 /*return*/, _b.apply(_a, [_d.sent()])];
                                }
                            });
                        });
                    },
                    deploy: function (id) { return __awaiter(void 0, void 0, void 0, function () { var _a, _b; return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                _b = (_a = contract).track;
                                return [4 /*yield*/, account.id(id).deploy(backend)];
                            case 1: return [2 /*return*/, _b.apply(_a, [_c.sent()])];
                        }
                    }); }); },
                    getAddress: function (id) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4 /*yield*/, account.id(id).getAddress()];
                            case 1: return [2 /*return*/, _a.sent()];
                        }
                    }); }); },
                    setGasLimit: function (id) {
                        var args = [];
                        for (var _i = 1; _i < arguments.length; _i++) {
                            args[_i - 1] = arguments[_i];
                        }
                        return __awaiter(void 0, void 0, void 0, function () {
                            var _a;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0: return [4 /*yield*/, (_a = account.id(id)).setGasLimit.apply(_a, args)];
                                    case 1: return [2 /*return*/, _b.sent()];
                                }
                            });
                        });
                    },
                    setDebugLabel: function (id, l) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2 /*return*/, account.id(id).setDebugLabel(l)];
                    }); }); },
                    tokenAccept: function (acc, tok) { return __awaiter(void 0, void 0, void 0, function () {
                        var t;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    t = token.id(tok);
                                    return [4 /*yield*/, account.id(acc).tokenAccept(t.id ? t.id : t)];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/, null];
                            }
                        });
                    }); },
                    tokenAccepted: function (acc, tok) { return __awaiter(void 0, void 0, void 0, function () {
                        var t;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    t = token.id(tok);
                                    return [4 /*yield*/, account.id(acc).tokenAccepted(t.id ? t.id : t)];
                                case 1: return [2 /*return*/, _a.sent()];
                            }
                        });
                    }); }
                };
                rpc_ctc = {
                    getInfo: function (id) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2 /*return*/, contract.id(id).getInfo()];
                    }); }); }
                };
                rpc_launchToken = {
                    mint: function (kid, accTo, amt) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2 /*return*/, token.id(kid).mint(account.id(accTo), real_stdlib.bigNumberify(amt))];
                    }); }); },
                    optOut: function (kid, accFrom, accTo) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                        return [2 /*return*/, token.id(kid).optOut(account.id(accFrom), accTo ? account.id(accTo) : undefined)];
                    }); }); }
                };
                safely = function (f) { return function (req, res) { return (function () { return __awaiter(void 0, void 0, void 0, function () {
                    var was, client, e_1, _a, s, message;
                    return __generator(this, function (_b) {
                        switch (_b.label) {
                            case 0:
                                was = kont.was;
                                client = "client " + req.ip + ": " + req.method + " " + req.originalUrl + " " + JSON.stringify(req.body);
                                _b.label = 1;
                            case 1:
                                _b.trys.push([1, 3, , 4]);
                                (0, shared_impl_1.debug)("Attempting to process request by " + client);
                                return [4 /*yield*/, f(req, res)];
                            case 2:
                                _b.sent();
                                return [3 /*break*/, 4];
                            case 3:
                                e_1 = _b.sent();
                                (0, shared_impl_1.debug)("!! Witnessed exception triggered by " + client + ":\n  " + e_1.stack);
                                _a = was.untracked(e_1) ? [404, String(e_1)]
                                    : [500, 'Unspecified fault'], s = _a[0], message = _a[1];
                                if (!res.headersSent) {
                                    res.status(s).json({ message: message, request: req.body });
                                    (0, shared_impl_1.debug)("!! HTTP " + s + ": \"" + message + "\" response sent to client");
                                }
                                else {
                                    res.end();
                                    (0, shared_impl_1.debug)("!! Response already initiated; unable to send appropriate payload");
                                }
                                return [3 /*break*/, 4];
                            case 4: return [2 /*return*/];
                        }
                    });
                }); })(); }; };
                mkRPC = function (olab, obj) {
                    var router = express_1["default"].Router();
                    var _loop_2 = function (k) {
                        router.post("/" + k, safely(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
                            var args, lab, ans, ret;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0:
                                        args = req.body;
                                        lab = "RPC /" + olab + "/" + k + " " + JSON.stringify(args);
                                        (0, shared_impl_1.debug)(lab);
                                        return [4 /*yield*/, obj[k].apply(obj, args)];
                                    case 1:
                                        ans = _a.sent();
                                        ret = ans === undefined ? null : ans;
                                        (0, shared_impl_1.debug)(lab + " ==> " + JSON.stringify(ret));
                                        res.json(ret);
                                        return [2 /*return*/];
                                }
                            });
                        }); }));
                    };
                    for (var k in obj) {
                        _loop_2(k);
                    }
                    return router;
                };
                userDefinedField = function (a, m) {
                    return a && a.hasOwnProperty && a.hasOwnProperty(m) && a[m] || null;
                };
                mkUserDefined = function (olab, prop, k, unsafe) {
                    var router = express_1["default"].Router();
                    router.post(/^\/(.*)/, safely(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
                        var _a, id, args, lab, a, e_2;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    if (!Array.isArray(req.body))
                                        throw new Error("Expected an array but received: " + req.body);
                                    _a = req.body, id = _a[0], args = _a.slice(1);
                                    lab = "RPC " + olab + req.path + " " + JSON.stringify(req.body);
                                    (0, shared_impl_1.debug)(lab);
                                    _b.label = 1;
                                case 1:
                                    _b.trys.push([1, 3, , 4]);
                                    return [4 /*yield*/, req.path.split('/')
                                            .filter(function (a) { return a !== ''; })
                                            .reduce(userDefinedField, k.id(id)[prop]).apply(void 0, args.map(reBigNumberify))];
                                case 2:
                                    a = _b.sent();
                                    (0, shared_impl_1.debug)(lab + " ==> " + JSON.stringify(a));
                                    return [2 /*return*/, res.json(a)];
                                case 3:
                                    e_2 = _b.sent();
                                    if (unsafe) {
                                        (0, shared_impl_1.debug)(lab + " ==> " + JSON.stringify(e_2));
                                        return [2 /*return*/, res.status(404).json({})];
                                    }
                                    else {
                                        (0, shared_impl_1.debug)(lab + " ==> " + JSON.stringify(null));
                                        return [2 /*return*/, res.json(null)];
                                    }
                                    return [3 /*break*/, 4];
                                case 4: return [2 /*return*/];
                            }
                        });
                    }); }));
                    return router;
                };
                route_backend.post(/^\/getExports\/(.*)/, safely(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
                    var args, lab, b, _a, _b, _c, a, _d;
                    return __generator(this, function (_e) {
                        switch (_e.label) {
                            case 0:
                                args = req.body;
                                if (!Array.isArray(args))
                                    throw new Error("Expected an array but received: " + args);
                                lab = "RPC /backend" + req.path + (args.length > 0 ? ' ' + JSON.stringify(args) : '');
                                (0, shared_impl_1.debug)(lab);
                                _b = (_a = req.path.split('/')
                                    .filter(function (a) { return a !== ''; })
                                    .slice(1)) // drop `getExports` path root
                                    .reduce;
                                _c = [userDefinedField];
                                return [4 /*yield*/, backend.getExports(real_stdlib)];
                            case 1: return [4 /*yield*/, _b.apply(_a, _c.concat([_e.sent()]))];
                            case 2:
                                b = _e.sent();
                                if (!(typeof b === 'function')) return [3 /*break*/, 4];
                                return [4 /*yield*/, b.apply(void 0, args)];
                            case 3:
                                _d = _e.sent();
                                return [3 /*break*/, 5];
                            case 4:
                                _d = b;
                                _e.label = 5;
                            case 5:
                                a = _d;
                                (0, shared_impl_1.debug)(lab + " ==> " + JSON.stringify(a));
                                res.json(a);
                                return [2 /*return*/];
                        }
                    });
                }); }));
                ctcPs = {};
                _loop_1 = function (b) {
                    var h = function (lab) { return safely(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
                        var _a, cid, vals, meths, ctc, kid, io, _loop_3, m, ans, new_res;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    (0, shared_impl_1.debug)(lab + " IN");
                                    _a = req.body, cid = _a[0], vals = _a[1], meths = _a[2];
                                    ctc = contract.id(cid);
                                    return [4 /*yield*/, kont.track(res)];
                                case 1:
                                    kid = _b.sent();
                                    lab = lab + " " + cid + " " + kid;
                                    (0, shared_impl_1.debug)(lab + " START " + JSON.stringify(req.body));
                                    io = __assign({}, vals);
                                    if (io['stdlib.hasRandom']) {
                                        delete io['stdlib.hasRandom'];
                                        io = __assign(__assign({}, real_stdlib.hasRandom), io);
                                    }
                                    _loop_3 = function (m) {
                                        io[m] = function () {
                                            var args = [];
                                            for (var _i = 0; _i < arguments.length; _i++) {
                                                args[_i] = arguments[_i];
                                            }
                                            return new Promise(function (resolve, reject) {
                                                (0, shared_impl_1.debug)(lab + " IO " + m + " " + JSON.stringify(args));
                                                var old_res = kont.id(kid);
                                                kont.replace(kid, { resolve: resolve, reject: reject });
                                                old_res.json({ t: "Kont", kid: kid, m: m, args: args });
                                            });
                                        };
                                    };
                                    for (m in meths) {
                                        _loop_3(m);
                                    }
                                    return [4 /*yield*/, backend[b](ctc, io)];
                                case 2:
                                    ans = _b.sent();
                                    (0, shared_impl_1.debug)(lab + " END " + JSON.stringify(ans));
                                    new_res = kont.id(kid);
                                    kont.forget(kid);
                                    (0, shared_impl_1.debug)(lab + " DONE");
                                    new_res.json({ t: "Done", ans: ans });
                                    return [2 /*return*/];
                            }
                        });
                    }); }); };
                    route_backend.post("/" + b, h("RPC /backend/" + b));
                    ctcPs["/ctc/p/" + b] = h("RPC /ctc/p/" + b);
                    ctcPs["/ctc/participants/" + b] = h("RPC /ctc/participants/" + b);
                };
                for (b in backend) {
                    _loop_1(b);
                }
                do_kont = safely(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
                    var lab, _a, kid, ans, _b, resolve, reject;
                    return __generator(this, function (_c) {
                        lab = "KONT";
                        (0, shared_impl_1.debug)(lab + " IN");
                        _a = req.body, kid = _a[0], ans = _a[1];
                        lab = lab + " " + kid;
                        (0, shared_impl_1.debug)(lab + " ANS " + JSON.stringify(ans));
                        _b = kont.id(kid), resolve = _b.resolve, reject = _b.reject;
                        void (reject);
                        kont.replace(kid, res);
                        (0, shared_impl_1.debug)(lab + " OUT");
                        resolve(ans);
                        return [2 /*return*/];
                    });
                }); });
                mkForget = function (K) { return safely(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        req.body.map(K.forget);
                        res.status(200).json({ deleted: req.body });
                        return [2 /*return*/];
                    });
                }); }); };
                app.use(withApiKey());
                app.use(express_1["default"].json());
                app.use("/stdlib", mkRPC('stdlib', rpc_stdlib));
                app.use("/acc", mkRPC('acc', rpc_acc));
                app.use("/ctc", mkRPC('ctc', rpc_ctc));
                app.use("/launchToken", mkRPC('launchToken', rpc_launchToken));
                app.use("/backend", route_backend);
                // NOTE: since `getViews()` is deprecated we deliberately skip it here
                app.use("/ctc/v", mkUserDefined('/ctc/v', 'v', contract, false));
                app.use("/ctc/views", mkUserDefined('/ctc/views', 'views', contract, false));
                app.use("/ctc/unsafeViews", mkUserDefined('/ctc/unsafeViews', 'unsafeViews', contract, true));
                app.use("/ctc/a", mkUserDefined('/ctc/a', 'a', contract, true));
                app.use("/ctc/apis", mkUserDefined('/ctc/apis', 'apis', contract, true));
                app.use("/ctc/safeApis", mkUserDefined('/ctc/safeApis', 'safeApis', contract, false));
                // NOTE: it's important these are deferred in order to preserve middleware precedence
                for (p in ctcPs) {
                    app.use(p, ctcPs[p]);
                }
                app.post("/kont", do_kont);
                // NOTE: successful `/backend/<participant>` requests automatically `forget`
                // their continuation ID before yielding a "Done" response; likewise with
                // requests to `/kont` due to their relationship with `/backend/<participant>`
                app.post("/forget/acc", mkForget(account));
                app.post("/forget/ctc", mkForget(contract));
                app.post("/forget/token", mkForget(token));
                app.post("/stop", safely(function (_, res) { return __awaiter(void 0, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        res.json(true);
                        process.exit(0);
                        return [2 /*return*/];
                    });
                }); }));
                app.post("/health", safely(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
                    return __generator(this, function (_a) {
                        void (req);
                        res.json(true);
                        return [2 /*return*/];
                    });
                }); }));
                app.disable('x-powered-by');
                fetchOrFail = function (envvar, desc) {
                    var f = process.env[envvar];
                    if (!f) {
                        console.error(["\nPlease populate the `" + envvar + "` environment variable with", " the path to your TLS " + desc + ".\n"
                        ].join(''));
                        process.exit(1);
                    }
                    var fq = (0, path_1.resolve)("./tls/" + f);
                    if (!(0, fs_1.existsSync)(fq)) {
                        console.error("\nPath: " + fq + " does not exist!\n");
                        process.exit(1);
                    }
                    return (0, fs_1.readFileSync)(fq);
                };
                opts = {
                    allowHTTP1: true,
                    key: fetchOrFail('REACH_RPC_TLS_KEY', 'private key'),
                    cert: fetchOrFail('REACH_RPC_TLS_CRT', 'public certificate')
                };
                passphrase = process.env.REACH_RPC_TLS_PASSPHRASE;
                if (passphrase)
                    Object.assign(opts, { passphrase: passphrase });
                // @ts-ignore
                (0, http2_1.createSecureServer)(opts, app)
                    .listen(process.env.REACH_RPC_PORT, function () {
                    return (0, shared_impl_1.debug)("I am alive");
                });
                return [2 /*return*/];
        }
    });
}); };
exports.serveRpc = serveRpc;
//# sourceMappingURL=rpc_server.js.map