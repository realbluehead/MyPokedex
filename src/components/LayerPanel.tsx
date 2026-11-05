import type { LayerInfo } from 'dxf-viewer'

interface Props {
  layers: LayerInfo[]
  hidden: Set<string>
  onToggle: (name: string, show: boolean) => void
  onAll: (show: boolean) => void
}

function hex(color: number) {
  return '#' + color.toString(16).padStart(6, '0')
}

export default function LayerPanel({ layers, hidden, onToggle, onAll }: Props) {
  return (
    <aside className="layers">
      <header>
        <h2>Capes <span className="count">{layers.length}</span></h2>
        <div className="layers-actions">
          <button type="button" className="link" onClick={() => onAll(true)}>Totes</button>
          <button type="button" className="link" onClick={() => onAll(false)}>Cap</button>
        </div>
      </header>
      <ul>
        {layers.map((l) => {
          const visible = !hidden.has(l.name)
          return (
            <li key={l.name}>
              <label title={l.displayName}>
                <input type="checkbox" checked={visible} onChange={(e) => onToggle(l.name, e.target.checked)} />
                <span className="swatch" style={{ background: hex(l.color) }} />
                <span className="layer-name">{l.displayName}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
