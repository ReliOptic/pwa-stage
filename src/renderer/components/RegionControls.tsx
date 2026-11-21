import { useState } from 'react';
import { regionLanguage, regionTimeZone } from '../../utils/region.util';
import type { SimulatorState } from '../../types/simulator.types';

const regions = [
  {name:'대한민국', language:'ko-KR', zone:'Asia/Seoul'},
  {name:'مصر', language:'ar-EG', zone:'Africa/Cairo'},
  {name:'Brasil · São Paulo', language:'pt-BR', zone:'America/Sao_Paulo'},
  {name:'Deutschland', language:'de-DE', zone:'Europe/Berlin'},
  {name:'France', language:'fr-FR', zone:'Europe/Paris'},
  {name:'भारत', language:'hi-IN', zone:'Asia/Kolkata'},
  {name:'日本', language:'ja-JP', zone:'Asia/Tokyo'},
  {name:'México · Ciudad de México', language:'es-MX', zone:'America/Mexico_City'},
  {name:'臺灣', language:'zh-Hant-TW', zone:'Asia/Taipei'},
  {name:'United States · New York', language:'en-US', zone:'America/New_York'}
];

export function RegionControls({state, onApply}: {state: SimulatorState; onApply: (patch: Partial<SimulatorState>) => void}) {
  const [language, setLanguage] = useState(state.previewLanguage || '');
  const [zone, setZone] = useState(state.previewTimeZone || '');
  const [error, setError] = useState('');
  const preset = regions.find(region => region.language === language && region.zone === zone);
  return <form id="region-controls" className="region-controls" onSubmit={e => {
    e.preventDefault();
    const previewLanguage = regionLanguage(language);
    const previewTimeZone = regionTimeZone(zone);
    if (previewLanguage === null || previewTimeZone === null) {
      const field = previewLanguage === null ? 'language' : 'timeZone';
      setError(field === 'language' ? 'Enter a supported language tag, such as ko-KR.' : 'Enter a time zone, such as Asia/Seoul.');
      (e.currentTarget.elements.namedItem(field) as HTMLInputElement).focus();
      return;
    }
    setError('');
    setLanguage(previewLanguage);
    setZone(previewTimeZone);
    onApply({previewLanguage, previewTimeZone});
  }}>
    <label>Region preset<select value={preset?.language || (language || zone ? 'custom' : '')}
      onChange={e => {
        const region = regions.find(item => item.language === e.target.value);
        setLanguage(region?.language || ''); setZone(region?.zone || ''); setError('');
      }}>
      <option value="">System default</option>
      {regions.map(region => <option key={region.language} value={region.language}>{region.name}</option>)}
      <option value="custom" disabled>Custom</option>
    </select></label>
    <label>Website language<input name="language" placeholder="System default"
      autoComplete="off" spellCheck={false} value={language} onChange={e => { setError(''); setLanguage(e.target.value); }}/></label>
    <label>Time zone<input name="timeZone" placeholder="System default"
      autoComplete="off" spellCheck={false} value={zone} onChange={e => { setError(''); setZone(e.target.value); }}/></label>
    {error && <p role="alert">{error}</p>}
    <div><button type="button" disabled={!language && !zone && !state.previewLanguage && !state.previewTimeZone}
      onClick={() => { setLanguage(''); setZone(''); setError(''); onApply({previewLanguage:'', previewTimeZone:''}); }}>Use system defaults</button>
      <button type="submit" disabled={language === (state.previewLanguage || '') && zone === (state.previewTimeZone || '')}>Apply &amp; reload</button></div>
  </form>;
}
