const P=[45,30,18,5.5,1.2,0.24,0.052,0.008],DPS=[5,17,60,210,760,2700,9500,40000],PIERCE=[0,0,.05,.1,.15,.2,.3,.5];
const orig=[10,30,80,140,1000,230,260,300,400,3000,600,580,800,800,5000,1000,1500,1800,1700,9999,3000,4000,2500,3800,20000,3500,4000,6000,7000,40000,9999,10000,10000,15000,80000,16000,16500,16500,20000,100000,25000,35000,35000,40000,200000,50000,60000,65000,75000,600000];
const odef=[0,0,0,0,1,1,1,1,1,3,2,3,3,4,5,5,6,8,9,10,10,15,12,16,20,20,20,24,24,30,25,28,30,30,30,32,34,36,35,50,40,40,42,45,60,50,50,52,50,100];
const N=r=>12+Math.floor(r/3);
const EASE=+process.argv[5]||0;const TR={};const SC=+process.argv[2]||1, GAM=+process.argv[3]||0.5, C=400, E=+process.argv[4]||0.5, FINAL=4;
const hp=r=>{const o=orig[r-1];let h=SC*Math.pow(o,GAM);if(r%5==0)h*=Math.min(1,0.3+r/50);if(EASE)h*=Math.min(1,0.4+0.15*r);if(r==50)h*=FINAL;return h};
const arm=r=>odef[r-1]/(odef[r-1]+40);
const rate=r=>r%5==0?(r==50?60:Math.max(30,Math.round(50-r*0.5))):20;
function pick(){let x=Math.random()*100;for(let g=0;g<8;g++){if((x-=P[g])<0)return g;}return 0}
function run(pol){
  let min=50,U={},L=0,backlogHP=0,mobs=0,r;
  for(r=1;r<=50;r++){
    // 강화
    const draw=()=>{const g=pick(),k=g*4+Math.floor(Math.random()*4);U[k]=(U[k]||0)+1;for(let gg=0;gg<7;gg++)for(let s=0;s<4;s++){const kk=gg*4+s;if((U[kk]||0)>=3&&!(pol.keep&&gg>=pol.keep)){U[kk]-=3;const nk=(gg+1)*4+Math.floor(Math.random()*4);U[nk]=(U[nk]||0)+1;}}};
    if(pol.up&&r>=pol.up){while(min>=60+10*L&&L<25&&min>0&&Math.random()<1){ if(min-(60+10*L)<0)break; min-=60+10*L;L++; if(Math.random()<.5)break;}}
    while(min>=15)(min-=15,draw());
    let dps=0,pp=0;for(const k in U){const g=Math.floor(k/4);dps+=U[k]*DPS[g];pp+=U[k]*DPS[g]*PIERCE[g]}
    const avgP=dps?pp/dps:0, mult=(1+0.12*(L+(pol.hero||0)))*E/(1-arm(r)*(1-avgP));
    const T=rate(r),boss=r%5==0,cnt=boss?1:N(r),h=hp(r);
    // 선입선출 유체모델
    const incoming=cnt*h; backlogHP+=incoming; mobs+=cnt;
    const cap=dps*mult*T; const kill=Math.min(backlogHP,cap);
    const avgHP=backlogHP/mobs; const killedMobs=Math.min(mobs,kill/avgHP);
    backlogHP-=kill; mobs-=killedMobs;
    if(boss&&mobs>0.5&&backlogHP>0&&kill<h*0.999) return {r,why:"boss"};
    min+=Math.floor(killedMobs)*2+(boss?50:0);
    (TR[r]=(TR[r]||0)+mobs);if(mobs>=100)return{r,why:"mobs"};
  }
  return{r:51,why:"clear"};
}
function stat(pol,T=400){const rs=[];let clear=0;for(let i=0;i<T;i++){const o=run(pol);rs.push(o.r);if(o.r>50)clear++}rs.sort((a,b)=>a-b);return `p10=${rs[T*.1|0]} med=${rs[T/2|0]} p90=${rs[T*.9|0]} clear=${(clear/T*100).toFixed(0)}%`}
console.log("naive ",stat({}));
console.log("upg   ",stat({up:8}));
console.log("upg+h ",stat({up:8,hero:3}));
console.log("upg keep5",stat({up:8,keep:5}));
console.log("avg mobs at r3,5,10,20:",[3,5,10,20].map(r=>(TR[r]/1600).toFixed(1)).join(" "));
