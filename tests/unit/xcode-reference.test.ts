import { describe, expect, it } from 'vitest';
import { selectReference } from '../../src/services/xcode-reference';

const runtime={identifier:'com.apple.CoreSimulator.SimRuntime.iOS-27-3',version:'27.3',isAvailable:true};
const device={udid:'test-id',deviceTypeIdentifier:'iPhone17Pro',state:'Booted',isAvailable:true};
const inventory={runtimes:[runtime],devices:{[runtime.identifier]:[device]},devicetypes:[{identifier:'iPhone17Pro',name:'iPhone 17 Pro'}]};

describe('Xcode reference selection',()=>{
  it('requires the selected hardware type even if the simulator was renamed',()=>{
    expect(selectReference(inventory,'iPhone 17 Pro').device.udid).toBe(device.udid);
    expect(()=>selectReference(inventory,'iPhone Duo · Inner')).toThrow('Found 0');
  });
  it('rejects other OS releases and ambiguous booted devices',()=>{
    expect(()=>selectReference({...inventory,runtimes:[{...runtime,version:'27.2'}]},'iPhone 17 Pro')).toThrow('Found 0');
    expect(()=>selectReference({...inventory,devices:{[runtime.identifier]:[device,{...device,udid:'second'}]}},'iPhone 17 Pro')).toThrow('Found 2');
  });
  it('excludes unavailable and shutdown devices',()=>{
    for(const patch of [{state:'Shutdown'},{isAvailable:false}]){
      expect(()=>selectReference({...inventory,devices:{[runtime.identifier]:[{...device,...patch}]}},'iPhone 17 Pro')).toThrow('Found 0');
    }
  });
});
