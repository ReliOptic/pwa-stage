// Capture the native reference on a Mac CI runner with a booted iOS 27.3 device.
const {captureSafari}=require('../dist-electron/services/xcode-reference');
const [device,url]=process.argv.slice(2);
async function main(){
  if(process.platform!=='darwin')throw Error('Native Safari reference requires macOS and the Xcode iOS 27.3 Simulator runtime.');
  if(!device || !url)throw Error('Usage: node scripts/xcode-safari.cjs "iPhone 17 Pro" https://your-project.example/');
  const result=await captureSafari(device,url);
  if(result.measurements.url!==new URL(url).href)throw Error('Safari landed on a different URL. Run against the final project URL.');
  console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
