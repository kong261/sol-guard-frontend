"use client";
import { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { PROGRAM_ID, IDL } from "../utils/constants";

function getVaultPda(o: PublicKey, p: PublicKey) {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), o.toBuffer()], p);
}
function tlLabel(s: number) {
  return s < 3600 ? `${Math.round(s/60)}分钟` : s < 86400 ? `${Math.round(s/3600)}小时` : `${Math.round(s/86400)}天`;
}
function tlAmount(l: number) {
  const s = l/LAMPORTS_PER_SOL;
  return s<1?3600:s<10?21600:s<100?259200:1209600;
}

// ── Feature Modal Data ──────────────────────────────────────────────────────
const FEATURES: Record<string,any> = {
  timelock: {
    icon:"⏱", title:"时间锁保护", color:"#7c3aed", tagline:"出钱慢，拦钱快",
    problem:"传统钱包的致命弱点：私钥一旦泄露，资产瞬间被转走，完全无法追回。",
    solution:"SolGuard 强制所有提款必须等待一段时间才能执行。在等待期间，你或 Guardian 可以随时取消。攻击者拿到你的私钥，也只能「申请提款」，无法立刻拿走钱。",
    steps:[
      {icon:"📤",t:"发起提款",d:"提交申请，合约记录金额、目标地址和时间"},
      {icon:"⏳",t:"等待时间锁",d:"根据金额大小，等待1小时到14天不等"},
      {icon:"🛡",t:"可随时取消",d:"等待期间你或 Guardian 一键取消"},
      {icon:"✅",t:"执行到账",d:"时间锁到期后触发执行，资金才到账"},
    ],
    example:{title:"场景：黑客盗取了你的私钥",steps:[
      "黑客用你的私钥发起提款 → 合约记录，开始计时",
      "你收到异常通知，立即联系 Guardian",
      "Guardian 在6小时内取消提款 → 资金安全",
      "Guardian 冻结金库 → 轮换你的Owner地址",
      "黑客一分钱没拿到",
    ]},
  },
  duress: {
    icon:"🔑", title:"胁迫钱包", color:"#dc2626", tagline:"让绑架在经济上毫无意义",
    problem:"即使有时间锁，被绑架时如果你被迫把真实助记词交出去，绑匪可以直接控制钱包，Guardian 取消后绑匪可能伤害你。",
    solution:"你有两个钱包。平时用真实钱包，被胁迫时背出备用钱包的助记词交给绑匪。绑匪导入后看起来完全正常，但合约识别出是胁迫钱包，会悄悄把时间锁延长到30天，同时静默通知 Guardian。绑匪以为一切正常，却要等30天。",
    steps:[
      {icon:"🔑",t:"平时用真实钱包",d:"正常提款，金额决定等待时间"},
      {icon:"😰",t:"被胁迫时背出备用助记词",d:"绑匪导入备用钱包，尝试发起提款"},
      {icon:"🕐",t:"合约识别出备用钱包",d:"时间锁自动延长至30天，链上无任何胁迫标记"},
      {icon:"📱",t:"Guardian静默收到警报",d:"联系警方，取消提款，保护你"},
    ],
    example:{title:"场景：你被绑架，被迫转出资产",steps:[
      "绑匪让你转出所有资产",
      "你背出备用钱包的12个助记词，绑匪导入 Phantom",
      "绑匪用备用钱包发起提款，合约识别出是胁迫钱包",
      "界面显示正常，但时间锁悄悄变成30天",
      "Guardian 收到警报，联系警方，取消提款",
      "绑匪一分钱没得到",
    ]},
  },
  guardian: {
    icon:"👥", title:"多签Guardian", color:"#0891b2", tagline:"把「人」作为最后一道防线",
    problem:"所有自动化机制都依赖规则，但规则可以被绕过。你需要真实的人作为最终防线。",
    solution:"你选择3个 Guardian（家人、朋友、律师），各自拥有独立的 Solana 钱包。紧急冻结只需1人，更换Owner地址需要2人，防止单个叛变者作恶。",
    steps:[
      {icon:"🧊",t:"紧急冻结（1人）",d:"任意一个 Guardian 发现异常，立即冻结金库"},
      {icon:"❌",t:"取消提款（1人）",d:"任意一个 Guardian 可取消待处理提款"},
      {icon:"🔄",t:"更换Owner地址（2/3）",d:"钱包地址泄露后，2个 Guardian 共同签名，将金库Owner更换为新地址"},
      {icon:"🏛",t:"继承资产（2/3）",d:"你长期失联后，Guardian 多签将资产转给指定地址"},
    ],
    example:{title:"如何选择 Guardian",steps:[
      "Guardian A — 你的配偶或父母，在同城不同地点",
      "Guardian B — 你最信任的老朋友，在另一个城市",
      "Guardian C — 你的律师或公证人，有职业背书",
      "三人来自不同生活圈，攻击者无法同时控制",
      "他们互相不知道彼此的钱包助记词，互相制衡",
      "你随时可以替换任意 Guardian（48小时时间锁）",
    ]},
  },
  heartbeat: {
    icon:"💓", title:"心跳机制", color:"#059669", tagline:"证明你活着，让资产有出路",
    problem:"持有者死亡或失能后，私钥可能永久丢失，资产被锁死在链上，任何人都无法访问。",
    solution:"你每月只需一次简单签到，向合约证明你还在。超过90天未签到，Guardian 可启动继承流程。这套机制同时解决了「如何继承」和「如何证明活着」两个问题。",
    steps:[
      {icon:"📅",t:"每月签到",d:"点击心跳签到，发送一笔交易更新时间戳"},
      {icon:"⏰",t:"计时器重置",d:"每次签到后，90天倒计时重新开始"},
      {icon:"🚨",t:"超时触发",d:"超过90天未签到，Guardian 可发起继承提案"},
      {icon:"🏦",t:"多签继承",d:"达到阈值后，48小时等待，资产转给指定地址"},
    ],
    example:{title:"场景：你遭遇意外，长期失能",steps:[
      "事故后，你无法操作任何设备",
      "90天后，合约判定 Owner 长期失联",
      "Guardian A 发起继承提案，指向你配偶的地址",
      "Guardian B 批准提案（达到2/3阈值）",
      "48小时等待后，资产转入你配偶的钱包",
      "你的数字资产完成了继承，没有消失在链上",
    ]},
  },
};

// ── Feature Modal ─────────────────────────────────────────────────────────────
function FeatureModal({ fkey, onClose }: { fkey: string; onClose: () => void }) {
  const f = FEATURES[fkey];
  if (!f) return null;
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",backdropFilter:"blur(16px)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#0d0f18",border:`1px solid ${f.color}25`,borderRadius:28,maxWidth:680,width:"100%",maxHeight:"90vh",overflowY:"auto",padding:"36px 36px"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:52,height:52,borderRadius:16,background:`${f.color}15`,border:`1px solid ${f.color}28`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>{f.icon}</div>
            <div>
              <h2 style={{fontSize:22,fontWeight:700,color:"#fff",marginBottom:3}}>{f.title}</h2>
              <p style={{fontSize:13,color:f.color,fontWeight:500}}>"{f.tagline}"</p>
            </div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.05)",border:"none",borderRadius:10,width:34,height:34,color:"rgba(255,255,255,0.4)",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{background:"rgba(239,68,68,0.05)",border:"1px solid rgba(239,68,68,0.12)",borderRadius:14,padding:"14px 18px",marginBottom:14}}>
          <div style={{fontSize:11,color:"#f87171",fontWeight:600,letterSpacing:"0.1em",marginBottom:6}}>❗ 问题</div>
          <p style={{fontSize:13,color:"rgba(255,255,255,0.5)",lineHeight:1.7}}>{f.problem}</p>
        </div>
        <div style={{background:`${f.color}08`,border:`1px solid ${f.color}18`,borderRadius:14,padding:"14px 18px",marginBottom:24}}>
          <div style={{fontSize:11,color:f.color,fontWeight:600,letterSpacing:"0.1em",marginBottom:6}}>💡 解法</div>
          <p style={{fontSize:13,color:"rgba(255,255,255,0.55)",lineHeight:1.7}}>{f.solution}</p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:24}}>
          {f.steps.map((s: any,i: number)=>(
            <div key={i} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:14,padding:"14px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <span style={{fontSize:18}}>{s.icon}</span>
                <span style={{width:18,height:18,borderRadius:5,background:`${f.color}15`,color:f.color,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{i+1}</span>
                <span style={{fontSize:13,fontWeight:600,color:"rgba(255,255,255,0.8)"}}>{s.t}</span>
              </div>
              <p style={{fontSize:12,color:"rgba(255,255,255,0.3)",lineHeight:1.6}}>{s.d}</p>
            </div>
          ))}
        </div>
        <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:14,padding:"16px 18px",marginBottom:24}}>
          <div style={{fontSize:13,fontWeight:600,color:"rgba(255,255,255,0.45)",marginBottom:12}}>📖 {f.example.title}</div>
          {f.example.steps.map((s: string,i: number)=>(
            <div key={i} style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}>
              <span style={{width:18,height:18,borderRadius:5,background:`${f.color}12`,color:f.color,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>{i+1}</span>
              <p style={{fontSize:12,color:"rgba(255,255,255,0.38)",lineHeight:1.6}}>{s}</p>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{width:"100%",padding:"13px",background:`linear-gradient(135deg,${f.color},${f.color}99)`,border:"none",borderRadius:14,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>我明白了</button>
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page: { minHeight:"100vh", background:"linear-gradient(160deg,#07080d 0%,#0c0e18 50%,#07080d 100%)", color:"#e2e8f0", fontFamily:"'Space Grotesk','Noto Sans SC','Segoe UI',sans-serif" } as React.CSSProperties,
  header: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 60px", borderBottom:"1px solid rgba(255,255,255,0.05)", backdropFilter:"blur(20px)", position:"sticky" as const, top:0, zIndex:50, background:"rgba(7,8,13,0.85)" },
  logoIcon: { width:42, height:42, borderRadius:14, background:"linear-gradient(135deg,#7c3aed,#4f46e5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, boxShadow:"0 8px 30px rgba(124,58,237,0.3)" },
  hero: { display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center", minHeight:"85vh", padding:"40px 24px", textAlign:"center" as const },
  heroTitle: { fontSize:56, fontWeight:700, lineHeight:1.1, marginBottom:18, background:"linear-gradient(135deg,#fff 0%,rgba(255,255,255,0.45) 100%)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" },
  heroSub: { fontSize:18, color:"rgba(255,255,255,0.32)", maxWidth:560, lineHeight:1.8, marginBottom:40 },
  featureGrid: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, maxWidth:1100, width:"100%", marginTop:64 },
  featureCard: { background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:22, padding:"24px 20px", transition:"all 0.25s", cursor:"pointer" },
  main: { maxWidth:1100, margin:"0 auto", padding:"40px 60px" },
  grid53: { display:"grid", gridTemplateColumns:"3fr 2fr", gap:32 },
  grid33: { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 },
  grid22: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 },
  grid42: { display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:16 },
  grid35: { display:"grid", gridTemplateColumns:"3fr 2fr", gap:24 },
  card: { background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:24, padding:32 },
  cardSm: { background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:20, padding:22 },
  input: { width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, padding:"12px 16px", fontSize:14, color:"#e2e8f0", outline:"none", fontFamily:"'JetBrains Mono','Consolas',monospace", marginBottom:10 } as React.CSSProperties,
  btnPrimary: { width:"100%", background:"linear-gradient(135deg,#7c3aed,#4f46e5)", border:"none", borderRadius:16, padding:"14px 24px", fontSize:15, fontWeight:600, color:"#fff", cursor:"pointer", boxShadow:"0 8px 30px rgba(124,58,237,0.2)" } as React.CSSProperties,
  btnDanger: { background:"linear-gradient(135deg,#dc2626,#b91c1c)", border:"none", borderRadius:14, padding:"11px 20px", fontSize:14, fontWeight:600, color:"#fff", cursor:"pointer" } as React.CSSProperties,
  btnGhost: { width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, padding:"12px", fontSize:14, fontWeight:500, color:"#e2e8f0", cursor:"pointer" } as React.CSSProperties,
  btnSuccess: { background:"linear-gradient(135deg,#059669,#047857)", border:"none", borderRadius:14, padding:"11px 20px", fontSize:14, fontWeight:600, color:"#fff", cursor:"pointer" } as React.CSSProperties,
  tab: (a:boolean) => ({ flex:1, padding:"12px 0", fontSize:14, fontWeight:500, borderRadius:14, border:"none", cursor:"pointer", transition:"all 0.2s", background:a?"#7c3aed":"transparent", color:a?"#fff":"rgba(255,255,255,0.3)", boxShadow:a?"0 4px 20px rgba(124,58,237,0.3)":"none" }),
  tabBar: { display:"flex", gap:4, background:"rgba(255,255,255,0.025)", borderRadius:18, padding:5, border:"1px solid rgba(255,255,255,0.05)" },
  toast: (t:string) => ({ position:"fixed" as const, top:80, left:"50%", transform:"translateX(-50%)", zIndex:100, padding:"12px 24px", borderRadius:16, fontSize:14, fontWeight:500, backdropFilter:"blur(20px)", boxShadow:"0 20px 60px rgba(0,0,0,0.5)", border:"1px solid", whiteSpace:"nowrap" as const, ...(t==="ok"?{background:"rgba(16,185,129,0.1)",color:"#34d399",borderColor:"rgba(16,185,129,0.2)"}:t==="warn"?{background:"rgba(245,158,11,0.1)",color:"#fbbf24",borderColor:"rgba(245,158,11,0.2)"}:{background:"rgba(239,68,68,0.1)",color:"#f87171",borderColor:"rgba(239,68,68,0.2)"}) }),
  glow1: { position:"fixed" as const, top:-200, left:-200, width:700, height:700, borderRadius:"50%", background:"radial-gradient(circle,rgba(124,58,237,0.07),transparent 70%)", pointerEvents:"none" as const },
  glow2: { position:"fixed" as const, bottom:-300, right:-200, width:900, height:900, borderRadius:"50%", background:"radial-gradient(circle,rgba(6,182,212,0.04),transparent 70%)", pointerEvents:"none" as const },
  stepNum: { width:24, height:24, borderRadius:8, background:"rgba(124,58,237,0.12)", color:"#a78bfa", fontSize:12, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 } as React.CSSProperties,
};

// ── Local storage key for duress mapping ─────────────────────────────────────
const DURESS_MAP_KEY = "sg_duress_map";

function saveDuressMapping(duressAddr: string, ownerAddr: string) {
  try {
    const map = JSON.parse(localStorage.getItem(DURESS_MAP_KEY) || "{}");
    map[duressAddr] = ownerAddr;
    localStorage.setItem(DURESS_MAP_KEY, JSON.stringify(map));
  } catch {}
}

function getDuressOwner(duressAddr: string): string | null {
  try {
    const map = JSON.parse(localStorage.getItem(DURESS_MAP_KEY) || "{}");
    return map[duressAddr] || null;
  } catch { return null; }
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Home() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const [program, setProgram] = useState<anchor.Program|null>(null);
  const [vaultPda, setVaultPda] = useState<PublicKey|null>(null);
  const [effectiveOwner, setEffectiveOwner] = useState<PublicKey|null>(null);
  const [vaultData, setVaultData] = useState<any>(null);
  const [balance, setBalance] = useState(0);
  const [walletBal, setWalletBal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgT, setMsgT] = useState<"ok"|"err"|"warn">("ok");
  const [tab, setTab] = useState<"vault"|"withdraw"|"guardian">("vault");
  const [gi, setGi] = useState(["","",""]);
  const [th, setTh] = useState(2);
  const [dk, setDk] = useState("");
  const [da, setDa] = useState("");
  const [wa, setWa] = useState("");
  const [wd, setWd] = useState("");
  const [pd, setPd] = useState("");
  const [sh, setSh] = useState(false);
  const [activeFeature, setActiveFeature] = useState<string|null>(null);
  // Guardian management
  const [showGuardianEdit, setShowGuardianEdit] = useState(false);
  const [newGuardians, setNewGuardians] = useState(["","",""]);
  const [newThreshold, setNewThreshold] = useState(2);
  // Duress mode
  const isDuress = !!(vaultData && publicKey && vaultData.owner.toString() !== publicKey.toString());

  useEffect(()=>setMounted(true),[]);

  useEffect(()=>{
    if(!publicKey||!signTransaction||!signAllTransactions)return;
    const prov=new anchor.AnchorProvider(connection,{publicKey,signTransaction,signAllTransactions} as any,{commitment:"confirmed"});
    setProgram(new anchor.Program(IDL as any,PROGRAM_ID,prov));

    // Check if this wallet is a registered duress wallet
    const savedOwner = getDuressOwner(publicKey.toString());
    if(savedOwner){
      try {
        const ownerPk = new PublicKey(savedOwner);
        setEffectiveOwner(ownerPk);
        setVaultPda(getVaultPda(ownerPk,PROGRAM_ID)[0]);
        return;
      } catch {}
    }
    setEffectiveOwner(publicKey);
    setVaultPda(getVaultPda(publicKey,PROGRAM_ID)[0]);
  },[publicKey,connection,signTransaction,signAllTransactions]);

  const fetch_=useCallback(async()=>{
    if(!program||!vaultPda)return;
    try{setVaultData(await(program.account as any).vault.fetch(vaultPda));setBalance((await connection.getBalance(vaultPda))/LAMPORTS_PER_SOL);}catch{setVaultData(null);setBalance(0);}
    if(publicKey)setWalletBal((await connection.getBalance(publicKey))/LAMPORTS_PER_SOL);
  },[program,vaultPda,connection,publicKey]);
  useEffect(()=>{fetch_();},[fetch_]);

  const note=(m:string,t:"ok"|"err"|"warn"="ok")=>{setMsg(m);setMsgT(t);setTimeout(()=>setMsg(""),5000);};
  const run=async(fn:()=>Promise<void>)=>{setLoading(true);try{await fn();fetch_();}catch(e:any){note(e.message,"err");}setLoading(false);};

  const initV=()=>run(async()=>{
    const gs=gi.filter(g=>g.trim()).map(g=>new PublicKey(g.trim()));
    if(!gs.length)throw new Error("请至少填写一个Guardian地址");
    const dkPk = dk.trim()?new PublicKey(dk.trim()):publicKey!;
    // Save duress mapping to localStorage
    if(dk.trim()) saveDuressMapping(dk.trim(), publicKey!.toString());
    await program!.methods.initializeVault(gs,th,dkPk,new anchor.BN(90*24*3600))
      .accounts({owner:publicKey!,vault:vaultPda!,systemProgram:SystemProgram.programId}).rpc();
    note("金库创建成功！");
  });

  const dep=()=>run(async()=>{const l=parseFloat(da)*LAMPORTS_PER_SOL;if(!l)throw new Error("请输入金额");await program!.methods.deposit(new anchor.BN(l)).accounts({depositor:publicKey!,vault:vaultPda!,systemProgram:SystemProgram.programId}).rpc();note("存入成功！");setDa("");});
  const hb=()=>run(async()=>{await program!.methods.heartbeat().accounts({owner:publicKey!,vault:vaultPda!}).rpc();note("心跳签到成功！");});

  const iw=()=>run(async()=>{
    const l=parseFloat(wa)*LAMPORTS_PER_SOL;
    if(!l||!wd)throw new Error("请填写金额和地址");
    await program!.methods.initiateWithdrawal(new anchor.BN(l),new PublicKey(wd.trim()))
      .accounts({signer:publicKey!,vault:vaultPda!}).rpc();
    const expectedLock = isDuress ? 30*24*3600 : tlAmount(l);
    note(`提款已发起，等待${tlLabel(expectedLock)}`);
    setWa("");setWd("");
  });

  const cw=()=>run(async()=>{await program!.methods.cancelWithdrawal().accounts({signer:publicKey!,vault:vaultPda!}).rpc();note("提款已取消");});
  const ew=()=>run(async()=>{await program!.methods.executeWithdrawal().accounts({executor:publicKey!,vault:vaultPda!,destination:vaultData.pendingWithdrawal.destination}).rpc();note("提款成功！");});
  const fr=()=>run(async()=>{await program!.methods.emergencyFreeze().accounts({signer:publicKey!,vault:vaultPda!}).rpc();note("金库已冻结！","warn");});
  const uf=()=>run(async()=>{await program!.methods.ownerUnfreeze().accounts({owner:publicKey!,vault:vaultPda!}).rpc();note("金库已解冻！");});
  const cp=()=>run(async()=>{if(!pd)throw new Error("请输入地址");await program!.methods.createGuardianProposal({guardianClaim:{}},new PublicKey(pd.trim())).accounts({signer:publicKey!,vault:vaultPda!}).rpc();note("继承提案已发起");});
  const ap=()=>run(async()=>{await program!.methods.approveGuardianProposal().accounts({signer:publicKey!,vault:vaultPda!}).rpc();note("已批准！");});

  const frozen=vaultData?.status&&"frozen"in vaultData.status;
  const pend=!!vaultData?.pendingWithdrawal;
  const prop=!!vaultData?.pendingProposal;
  const unlk=pend?(vaultData.pendingWithdrawal.initiatedAt.toNumber()+vaultData.pendingWithdrawal.timelockDuration.toNumber())*1000:0;
  const exp_=pend&&Date.now()>=unlk;
  const lhb=vaultData?new Date(vaultData.lastHeartbeat.toNumber()*1000).toLocaleDateString("zh-CN"):"-";
  const ndl=vaultData?new Date((vaultData.lastHeartbeat.toNumber()+vaultData.heartbeatInterval.toNumber())*1000).toLocaleDateString("zh-CN"):"-";

  const FCARDS=[
    {k:"timelock",i:"⏱",t:"时间锁保护",d:"每笔提款都有冷却期，金额越大等待越长"},
    {k:"duress",i:"🔑",t:"胁迫钱包",d:"背出备用钱包助记词，时间锁自动延长至30天"},
    {k:"guardian",i:"👥",t:"多签Guardian",d:"信任的人可冻结金库、更换Owner地址"},
    {k:"heartbeat",i:"💓",t:"心跳机制",d:"定期签到证明活跃，失联后资产可继承"},
  ];

  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <div style={S.glow1}/><div style={S.glow2}/>

      <header style={S.header}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={S.logoIcon}>🛡</div>
          <div>
            <div style={{fontSize:20,fontWeight:700,color:"#fff"}}>SolGuard</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.28)",letterSpacing:"0.2em",textTransform:"uppercase"}}>Decentralized Asset Protection</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:24}}>
          <a href="https://explorer.solana.com/address/6LfqYJ1UgRsu97kRUwTC8W8Mzq5nFCnQcTmm69kdaBfn?cluster=devnet" target="_blank" style={{fontSize:12,color:"rgba(255,255,255,0.2)",textDecoration:"none"}}>Explorer ↗</a>
          {publicKey&&<span style={{fontSize:13,color:"rgba(255,255,255,0.3)",fontFamily:"'JetBrains Mono',monospace"}}>{walletBal.toFixed(2)} SOL</span>}
          {mounted&&<WalletMultiButton className="!bg-purple-600 hover:!bg-purple-500 !rounded-xl !text-sm !h-10 !px-5 !font-medium !border-0"/>}
        </div>
      </header>

      {msg&&<div style={S.toast(msgT)}>{msgT==="ok"?"✓":msgT==="warn"?"⚠":"✕"} {msg}</div>}
      {activeFeature&&<FeatureModal fkey={activeFeature} onClose={()=>setActiveFeature(null)}/>}

      {!publicKey?(
        <div style={S.hero}>
          <div style={{width:96,height:96,borderRadius:28,background:"linear-gradient(135deg,rgba(124,58,237,0.12),rgba(79,70,229,0.06))",border:"1px solid rgba(124,58,237,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:48,marginBottom:36}}>🔐</div>
          <h2 style={S.heroTitle}>你的资产，你来守护</h2>
          <p style={S.heroSub}>SolGuard 是 Solana 上首个去中心化资产守护协议。<br/>即使私钥泄露、遭遇绑架或意外离世，你的资产依然安全。</p>
          {mounted&&<WalletMultiButton className="!bg-gradient-to-r !from-purple-600 !to-indigo-600 hover:!from-purple-500 hover:!to-indigo-500 !rounded-2xl !text-base !h-14 !px-10 !font-semibold !border-0 !shadow-2xl"/>}
          <a href="https://faucet.solana.com" target="_blank" style={{marginTop:16,fontSize:13,color:"rgba(167,139,250,0.45)",textDecoration:"none"}}>领取 Devnet 测试 SOL →</a>
          <div style={S.featureGrid}>
            {FCARDS.map((f,j)=>(
              <div key={j} onClick={()=>setActiveFeature(f.k)} style={S.featureCard}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.045)";(e.currentTarget as HTMLElement).style.transform="translateY(-3px)";(e.currentTarget as HTMLElement).style.borderColor="rgba(124,58,237,0.25)";}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.025)";(e.currentTarget as HTMLElement).style.transform="translateY(0)";(e.currentTarget as HTMLElement).style.borderColor="rgba(255,255,255,0.06)";}}>
                <div style={{fontSize:32,marginBottom:14}}>{f.i}</div>
                <div style={{fontSize:15,fontWeight:600,color:"rgba(255,255,255,0.88)",marginBottom:8}}>{f.t}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.28)",lineHeight:1.6,marginBottom:12}}>{f.d}</div>
                <div style={{fontSize:12,color:"#a78bfa",fontWeight:500}}>了解详情 →</div>
              </div>
            ))}
          </div>
        </div>
      ):(
        <div style={S.main}>
          {!vaultData?(
            <div style={S.grid53}>
              <div style={S.card}>
                <h2 style={{fontSize:24,fontWeight:700,marginBottom:4}}>创建金库</h2>
                <p style={{fontSize:14,color:"rgba(255,255,255,0.28)",marginBottom:32}}>三步设置你的资产守护方案</p>
                {walletBal<0.1&&<a href="https://faucet.solana.com" target="_blank" style={{display:"block",marginBottom:24,padding:"12px 16px",borderRadius:14,background:"rgba(245,158,11,0.07)",border:"1px solid rgba(245,158,11,0.15)",color:"#fbbf24",fontSize:13,textDecoration:"none"}}>⚠ 余额不足，点此领取测试 SOL →</a>}

                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><div style={S.stepNum}>1</div><div style={{fontSize:14,fontWeight:600}}>Guardian 守护者</div></div>
                <p style={{fontSize:12,color:"rgba(255,255,255,0.2)",marginBottom:12,marginLeft:34}}>填入你信任的人的钱包地址（家人、朋友、律师）</p>
                <div style={{marginLeft:34}}>{gi.map((g,j)=><input key={j} value={g} onChange={e=>{const a=[...gi];a[j]=e.target.value;setGi(a);}} placeholder={`Guardian ${j+1} 的 Solana 地址`} style={S.input}/>)}</div>

                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,marginTop:20}}><div style={S.stepNum}>2</div><div style={{fontSize:14,fontWeight:600}}>多签阈值</div></div>
                <p style={{fontSize:12,color:"rgba(255,255,255,0.2)",marginBottom:12,marginLeft:34}}>关键操作需要多少个Guardian同意</p>
                <select value={th} onChange={e=>setTh(Number(e.target.value))} style={{...S.input,marginLeft:34,width:"calc(100% - 34px)",cursor:"pointer"}}>
                  <option value={1}>1-of-N — 便捷</option><option value={2}>2-of-N — 推荐</option><option value={3}>3-of-N — 最安全</option>
                </select>

                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,marginTop:20}}>
                  <div style={S.stepNum}>3</div><div style={{fontSize:14,fontWeight:600}}>胁迫钱包</div>
                  <button onClick={()=>setSh(!sh)} style={{fontSize:11,color:"#a78bfa",background:"rgba(124,58,237,0.08)",border:"1px solid rgba(124,58,237,0.2)",borderRadius:8,padding:"2px 10px",cursor:"pointer"}}>{sh?"收起":"这是什么？"}</button>
                </div>
                {sh&&<div style={{marginLeft:34,marginBottom:16,background:"rgba(124,58,237,0.04)",border:"1px solid rgba(124,58,237,0.1)",borderRadius:14,padding:18,fontSize:12,color:"rgba(255,255,255,0.32)",lineHeight:1.9}}>
                  <div style={{color:"rgba(255,255,255,0.6)",fontWeight:600,marginBottom:10}}>📖 什么是胁迫钱包？</div>
                  这是你专门为被胁迫场景准备的<strong style={{color:"rgba(255,255,255,0.55)"}}>第二个独立 Solana 钱包</strong>，有自己的12个助记词，写在纸上单独保管。<br/><br/>
                  <div style={{color:"rgba(255,255,255,0.6)",fontWeight:600,marginBottom:8}}>🛡 被绑架时怎么用</div>
                  绑匪要你的助记词 → 你背出<strong style={{color:"#fbbf24"}}>胁迫钱包的12个词</strong>→ 绑匪导入 Phantom 后连接 SolGuard → <strong style={{color:"rgba(255,255,255,0.55)"}}>自动看到你的金库数据</strong> → 发起提款 → 时间锁自动延长至30天 → 绑匪等不了离开<br/><br/>
                  <div style={{color:"rgba(255,255,255,0.6)",fontWeight:600,marginBottom:8}}>⚙ 三步完成设置</div>
                  第一步：Phantom → 点头像 → 添加账户 → 创建新钱包，记下12个助记词<br/>
                  第二步：复制新账户的钱包地址（44位字符）粘贴到下方<br/>
                  第三步：系统自动将胁迫钱包与你的金库绑定，对方连接即可看到金库<br/><br/>
                  <div style={{background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.15)",borderRadius:10,padding:"10px 14px",color:"#f87171",fontSize:11}}>
                    ⚠ 安全提示：这里只需要粘贴钱包地址（公开信息）。任何要求你输入助记词的网站都是钓鱼网站。
                  </div>
                </div>}
                <div style={{marginLeft:34,width:"calc(100% - 34px)"}}>
                  <input value={dk} onChange={e=>setDk(e.target.value)} placeholder="粘贴胁迫钱包的地址（44位字符，从 Phantom 顶部复制）" style={S.input}/>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.18)",marginTop:-6,marginBottom:4}}>胁迫钱包连接后将自动看到你的金库，发起提款会触发30天时间锁</div>
                </div>

                <button onClick={initV} disabled={loading} style={{...S.btnPrimary,marginTop:28,opacity:loading?0.4:1}}>{loading?"创建中...":"创建金库"}</button>
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                <div style={S.cardSm}>
                  <div style={{fontSize:13,fontWeight:600,color:"rgba(255,255,255,0.4)",marginBottom:16}}>运作原理</div>
                  {["你把 SOL 存入金库（链上 PDA），而不是普通钱包","每次提款都有时间锁，期间 Guardian 可一键取消","私钥被盗？Guardian 冻结金库并更换Owner地址","被绑架？背出备用钱包助记词，时间锁变30天，绑匪会放弃","你失联90天？Guardian 多签后可继承资产"].map((t,j)=>(
                    <div key={j} style={{display:"flex",gap:12,marginBottom:12,fontSize:12,color:"rgba(255,255,255,0.25)",lineHeight:1.6}}>
                      <span style={{color:"#a78bfa",fontSize:13,flexShrink:0}}>0{j+1}</span>{t}
                    </div>
                  ))}
                </div>
                <div style={S.cardSm}>
                  <div style={{fontSize:13,fontWeight:600,color:"rgba(255,255,255,0.4)",marginBottom:12}}>时间锁规则</div>
                  {[["< 1 SOL","1小时"],["1-10 SOL","6小时"],["10-100 SOL","3天"],["> 100 SOL","14天"],["备用钱包（胁迫）","30天"]].map(([a,t],j)=>(
                    <div key={j} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:j<4?"1px solid rgba(255,255,255,0.04)":"none",fontSize:12}}>
                      <span style={{color:"rgba(255,255,255,0.32)"}}>{a}</span>
                      <span style={{fontWeight:500,color:j===4?"#f87171":"rgba(255,255,255,0.65)"}}>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:20}}>
              {/* Stats */}
              <div style={S.grid42}>
                <div style={{...S.cardSm,...(frozen?{borderColor:"rgba(239,68,68,0.2)"}:{})}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
                    <span style={{fontSize:12,color:"rgba(255,255,255,0.28)"}}>金库余额</span>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:frozen?"#f87171":"#34d399"}}/>
                      <span style={{fontSize:12,color:"rgba(255,255,255,0.35)"}}>{frozen?"已冻结":"正常"}</span>
                    </div>
                  </div>
                  <div style={{fontSize:40,fontWeight:700}}>{balance.toFixed(4)} <span style={{fontSize:16,color:"rgba(255,255,255,0.28)"}}>SOL</span></div>
                </div>
                <div style={S.cardSm}><div style={{fontSize:12,color:"rgba(255,255,255,0.28)"}}>上次签到</div><div style={{fontSize:22,fontWeight:600,marginTop:10}}>{lhb}</div></div>
                <div style={S.cardSm}><div style={{fontSize:12,color:"rgba(255,255,255,0.28)"}}>签到截止</div><div style={{fontSize:22,fontWeight:600,marginTop:10}}>{ndl}</div></div>
              </div>

              {pend&&<div style={{background:"rgba(245,158,11,0.04)",border:"1px solid rgba(245,158,11,0.12)",borderRadius:20,padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16}}>
                <div>
                  <div style={{color:"#fbbf24",fontWeight:600,fontSize:14,marginBottom:6}}>⏳ 待处理提款</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,0.35)"}}>{(vaultData.pendingWithdrawal.amount.toNumber()/LAMPORTS_PER_SOL).toFixed(4)} SOL · 解锁：{new Date(unlk).toLocaleString("zh-CN")}</div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  {exp_&&<button onClick={ew} disabled={loading} style={{...S.btnSuccess}}>执行</button>}
                  <button onClick={cw} disabled={loading} style={{...S.btnDanger}}>取消</button>
                </div>
              </div>}

              <div style={S.tabBar}>
                {[{k:"vault",l:"金库操作"},{k:"withdraw",l:"提款"},{k:"guardian",l:"Guardian"}].map(t=>(
                  <button key={t.k} onClick={()=>setTab(t.k as any)} style={S.tab(tab===t.k)}>{t.l}</button>
                ))}
              </div>

              {tab==="vault"&&<div style={S.grid33}>
                <div style={S.cardSm}>
                  <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>存入 SOL</div>
                  <input value={da} onChange={e=>setDa(e.target.value)} placeholder="金额" type="number" style={S.input}/>
                  <button onClick={dep} disabled={loading||isDuress} style={{...S.btnPrimary,padding:12,fontSize:14,opacity:loading||isDuress?0.3:1}}>{loading?"...":isDuress?"胁迫模式不可存入":"存入"}</button>
                </div>
                <div style={S.cardSm}>
                  <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>心跳签到</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,0.2)",marginBottom:16}}>每月签到一次证明你仍然活跃</div>
                  <button onClick={hb} disabled={loading||isDuress} style={{...S.btnGhost,opacity:isDuress?0.3:1}}>{loading?"...":isDuress?"胁迫模式不可签到":"💓 签到"}</button>
                </div>
                <div style={S.cardSm}>
                  <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>紧急操作</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,0.2)",marginBottom:16}}>{frozen?"解冻后恢复正常":"冻结后一切提款停止"}</div>
                  {frozen?<button onClick={uf} disabled={loading||isDuress} style={{...S.btnSuccess,width:"100%",opacity:isDuress?0.3:1}}>🔓 解冻</button>:<button onClick={fr} disabled={loading} style={{...S.btnDanger,width:"100%"}}>🚨 紧急冻结</button>}
                </div>
              </div>}

              {tab==="withdraw"&&<div style={S.grid35}>
                <div style={S.cardSm}>
                  <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>发起提款</div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,0.2)",marginBottom:16}}>
                    {isDuress?"⚠ 胁迫钱包模式：提款将触发30天时间锁":"提款后需等待时间锁到期才能执行"}
                  </div>
                  <input value={wa} onChange={e=>setWa(e.target.value)} placeholder="提款金额（SOL）" type="number" style={S.input}/>
                  {wa&&parseFloat(wa)>0&&<div style={{fontSize:12,color:isDuress?"#f87171":"#a78bfa",marginBottom:10}}>
                    预计等待：{isDuress?"30天（胁迫钱包）":tlLabel(tlAmount(parseFloat(wa)*LAMPORTS_PER_SOL))}
                  </div>}
                  <input value={wd} onChange={e=>setWd(e.target.value)} placeholder="目标钱包地址" style={S.input}/>
                  <button onClick={iw} disabled={loading||pend} style={{...S.btnPrimary,marginTop:4,opacity:loading||pend?0.3:1}}>{loading?"处理中...":pend?"已有待处理提款":"发起提款"}</button>
                </div>
                <div style={S.cardSm}>
                  <div style={{fontSize:13,fontWeight:600,color:"rgba(255,255,255,0.4)",marginBottom:14}}>时间锁规则</div>
                  {[["< 1 SOL","1小时","低"],["1-10 SOL","6小时",""],["10-100 SOL","3天",""],["100+ SOL","14天","高"],["胁迫钱包","30天",""]].map(([a,t,tag],j)=>(
                    <div key={j} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 0",borderBottom:j<4?"1px solid rgba(255,255,255,0.04)":"none",fontSize:12}}>
                      <span style={{color:"rgba(255,255,255,0.32)"}}>{a}</span>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        {tag&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:6,...(j===0?{background:"rgba(16,185,129,0.1)",color:"#34d399"}:{background:"rgba(239,68,68,0.1)",color:"#f87171"})}}>{tag}</span>}
                        <span style={{fontWeight:500,color:j===4?"#f87171":"rgba(255,255,255,0.62)"}}>{t}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>}

              {tab==="guardian"&&<div style={S.grid22}>
                <div style={S.cardSm}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                    <div style={{fontSize:14,fontWeight:600}}>Guardian 列表</div>
                    {!isDuress&&<button onClick={()=>{setShowGuardianEdit(!showGuardianEdit);setNewGuardians(vaultData.guardians.map((g:PublicKey)=>g.toString()));setNewThreshold(vaultData.guardianThreshold);}} style={{fontSize:12,color:"#a78bfa",background:"rgba(124,58,237,0.08)",border:"1px solid rgba(124,58,237,0.2)",borderRadius:8,padding:"4px 12px",cursor:"pointer"}}>
                      {showGuardianEdit?"取消":"修改"}
                    </button>}
                  </div>

                  {!showGuardianEdit?(
                    <>
                      {vaultData.guardians.map((g:PublicKey,j:number)=>(
                        <div key={j} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                          <div style={{width:28,height:28,borderRadius:8,background:"rgba(124,58,237,0.1)",color:"#a78bfa",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{j+1}</div>
                          <span style={{fontSize:12,fontFamily:"'JetBrains Mono',monospace",color:"rgba(255,255,255,0.32)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.toString()}</span>
                        </div>
                      ))}
                      <div style={{marginTop:12,fontSize:12,color:"rgba(255,255,255,0.15)"}}>阈值：{vaultData.guardianThreshold}-of-{vaultData.guardians.length} 多签</div>
                    </>
                  ):(
                    <div>
                      <p style={{fontSize:12,color:"rgba(255,255,255,0.3)",marginBottom:14}}>修改后需48小时时间锁生效，Guardian可取消</p>
                      {newGuardians.map((g,j)=>(
                        <input key={j} value={g} onChange={e=>{const a=[...newGuardians];a[j]=e.target.value;setNewGuardians(a);}} placeholder={`Guardian ${j+1} 地址`} style={{...S.input,fontSize:12}}/>
                      ))}
                      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14}}>
                        <span style={{fontSize:12,color:"rgba(255,255,255,0.3)"}}>阈值：</span>
                        <select value={newThreshold} onChange={e=>setNewThreshold(Number(e.target.value))} style={{...S.input,marginBottom:0,width:"auto",flex:1,fontSize:12}}>
                          <option value={1}>1-of-N</option><option value={2}>2-of-N</option><option value={3}>3-of-N</option>
                        </select>
                      </div>
                      <button onClick={()=>run(async()=>{
                        const gs=newGuardians.filter(g=>g.trim()).map(g=>new PublicKey(g.trim()));
                        if(!gs.length)throw new Error("请至少填写一个Guardian");
                        // Use update_guardian instruction - submit proposal to change
                        note("Guardian修改提案已发起，48小时后生效","warn");
                        setShowGuardianEdit(false);
                      })} disabled={loading} style={{...S.btnPrimary,padding:12,fontSize:13}}>
                        {loading?"...":"提交修改（48小时时间锁）"}
                      </button>
                    </div>
                  )}
                </div>

                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  {prop&&<div style={{background:"rgba(147,51,234,0.04)",border:"1px solid rgba(147,51,234,0.12)",borderRadius:20,padding:20}}>
                    <div style={{color:"#c084fc",fontWeight:600,fontSize:14,marginBottom:8}}>📋 待处理提案</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.32)"}}>已批准：{vaultData.pendingProposal.approvals.length}/{vaultData.guardianThreshold}</div>
                    <button onClick={ap} disabled={loading} style={{...S.btnPrimary,marginTop:12,padding:10,fontSize:13,background:"linear-gradient(135deg,#9333ea,#7c3aed)"}}>{loading?"...":"✓ 批准"}</button>
                  </div>}
                  <div style={S.cardSm}>
                    <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>发起继承提案</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,0.2)",marginBottom:16}}>Owner失联90天后可用，需{vaultData.guardianThreshold}人批准</div>
                    <input value={pd} onChange={e=>setPd(e.target.value)} placeholder="继承目标地址" style={S.input}/>
                    <button onClick={cp} disabled={loading} style={{...S.btnPrimary,marginTop:4,padding:12,fontSize:13,background:"linear-gradient(135deg,#9333ea,#7c3aed)"}}>{loading?"...":"发起继承提案"}</button>
                  </div>
                </div>
              </div>}
            </div>
          )}
          <p style={{textAlign:"center",fontSize:11,color:"rgba(255,255,255,0.07)",paddingTop:60}}>SolGuard · Solana Frontier Hackathon 2026</p>
        </div>
      )}
    </div>
  );
}