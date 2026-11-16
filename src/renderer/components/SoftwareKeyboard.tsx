import React from 'react';
import { ArrowBigUp, Delete, Globe, Mic } from 'lucide-react';

const ROWS: readonly (readonly string[])[] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm']
];

/**
 * Visual iOS software keyboard. It occupies the exact area the real keyboard
 * covers so layouts can be checked against it; text is typed with the Mac
 * keyboard (like Xcode's "Connect Hardware Keyboard"), so the keys are not
 * interactive and never steal focus from the page.
 */
export function SoftwareKeyboard(props: {
  readonly visible: boolean;
  readonly height: number;
  readonly trailingInset: number;
  readonly darkMode: boolean;
  readonly bottomSafeArea: number;
}): React.ReactElement {
  const compact = props.height < 240;
  return (
    <div
      className={`ios-keyboard ${props.darkMode ? 'ios-keyboard-dark' : 'ios-keyboard-light'} ${
        props.visible ? 'ios-keyboard-visible' : ''
      } ${compact ? 'ios-keyboard-compact' : ''}`}
      style={{
        height: `${props.height}px`,
        right: `${props.trailingInset}px`,
        paddingBottom: `${props.bottomSafeArea + (compact ? 2 : 28)}px`
      }}
      aria-hidden="true"
    >
      <div className="ios-keyboard-suggestions">
        <span>I</span>
        <span>The</span>
        <span>I’m</span>
      </div>
      {ROWS.map((row, i) => (
        <div key={row[0]} className="ios-keyboard-row">
          {i === 2 && (
            <span className="ios-key ios-key-fn">
              <ArrowBigUp size={18} />
            </span>
          )}
          {row.map((k) => (
            <span key={k} className="ios-key">
              {k}
            </span>
          ))}
          {i === 2 && (
            <span className="ios-key ios-key-fn">
              <Delete size={18} />
            </span>
          )}
        </div>
      ))}
      <div className="ios-keyboard-row">
        <span className="ios-key ios-key-fn ios-key-wide">123</span>
        <span className="ios-key ios-key-space">space</span>
        <span className="ios-key ios-key-fn ios-key-wide">return</span>
      </div>
      {!compact && (
        <div className="ios-keyboard-footer">
          <Globe size={22} />
          <Mic size={22} />
        </div>
      )}
    </div>
  );
}
