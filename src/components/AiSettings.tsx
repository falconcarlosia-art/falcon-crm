import { useEffect, useMemo, useState } from 'react'
import { errorMessage, useToast } from './toast'
import { listModels, opCost, saveAiConfig, usd, type AiConfig, type AiModel } from '../ai'

type Slot = 'quoteModel' | 'chatModel'
const SLOTS: { key: Slot; label: string; hint: string }[] = [
  { key: 'quoteModel', label: 'Modelo para cotizar', hint: 'Arma la cotización desde el mensaje del cliente.' },
  { key: 'chatModel', label: 'Modelo para analizar chats', hint: 'Lee la conversación y actualiza la ficha.' },
]

export function AiSettings({ config }: { config: AiConfig }) {
  const toast = useToast()
  const [form, setForm] = useState(config)
  const [dirty, setDirty] = useState(false)
  const [models, setModels] = useState<AiModel[]>([])
  const [loadError, setLoadError] = useState('')
  const [picking, setPicking] = useState<Slot | null>(null)
  const [search, setSearch] = useState('')
  const [onlyStructured, setOnlyStructured] = useState(true)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    if (!dirty) setForm(config)
  }, [config, dirty])

  useEffect(() => {
    listModels()
      .then(setModels)
      .catch((err) => setLoadError(errorMessage(err)))
  }, [])

  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models])
  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return models
      .filter((m) => (!onlyStructured || m.structured) && (!q || `${m.id} ${m.name}`.toLowerCase().includes(q)))
      .sort((a, b) => opCost(a) - opCost(b))
      .slice(0, 80)
  }, [models, search, onlyStructured])

  const set = (patch: Partial<AiConfig>) => {
    setForm((f) => ({ ...f, ...patch }))
    setDirty(true)
  }

  function save() {
    saveAiConfig({ ...form, apiKey: form.apiKey.trim() }).catch((err) => toast(errorMessage(err), 'error'))
    setDirty(false)
    toast('Configuración de IA guardada')
  }

  return (
    <section className="card ai-settings">
      <div className="ai-head">
        <h3 className="section-title">Inteligencia artificial · OpenRouter</h3>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={!dirty}>
          Guardar IA
        </button>
      </div>
      <div className="form">
        <label className="field">
          <span>API key de OpenRouter</span>
          <div className="key-row">
            <input
              type={showKey ? 'text' : 'password'}
              value={form.apiKey}
              onChange={(e) => set({ apiKey: e.target.value })}
              placeholder="sk-or-v1-…"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowKey((s) => !s)}>
              {showKey ? 'Ocultar' : 'Ver'}
            </button>
          </div>
          <small className="hint">
            Créala en openrouter.ai/keys y ponle un <b>límite de crédito</b>: la key se guarda en tu Firebase (solo tu cuenta la
            lee) y se usa desde tu navegador.
          </small>
        </label>

        {SLOTS.map(({ key, label, hint }) => {
          const m = byId.get(form[key])
          return (
            <div key={key} className="field">
              <span>{label}</span>
              <button type="button" className="model-current" onClick={() => setPicking(picking === key ? null : key)}>
                {form[key] ? (
                  <>
                    <b>{m?.name ?? form[key]}</b>
                    <span className="muted small">
                      {m ? `≈ ${usd(opCost(m))} por uso · ${modelPrices(m)}` : form[key]}
                    </span>
                  </>
                ) : (
                  <span className="muted">Elegir modelo…</span>
                )}
              </button>
              <small className="hint">{hint}</small>

              {picking === key && (
                <div className="model-picker">
                  <div className="model-tools">
                    <input
                      autoFocus
                      type="search"
                      placeholder="Buscar: gemini, llama, claude, deepseek…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <label className="check small">
                      <input type="checkbox" checked={onlyStructured} onChange={(e) => setOnlyStructured(e.target.checked)} />
                      Solo con salida estructurada (recomendado)
                    </label>
                  </div>
                  {loadError ? (
                    <p className="hint hint-error">No se pudo cargar la lista de modelos: {loadError}</p>
                  ) : models.length === 0 ? (
                    <p className="muted small">Cargando modelos…</p>
                  ) : (
                    <ul className="model-list">
                      {list.map((mm) => (
                        <li key={mm.id}>
                          <button
                            type="button"
                            className={mm.id === form[key] ? 'on' : ''}
                            onClick={() => {
                              set({ [key]: mm.id } as Partial<AiConfig>)
                              setPicking(null)
                            }}
                          >
                            <span className="model-name">
                              <b>{mm.name}</b>
                              <span className="muted small">{mm.id}</span>
                            </span>
                            <span className="model-price">
                              <b>{usd(opCost(mm))}</b>
                              <span className="muted small">{modelPrices(mm)}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                      {list.length === 0 && <li className="muted small">Sin resultados.</li>}
                    </ul>
                  )}
                  <small className="hint">
                    Ordenados por costo de una operación típica (≈4.000 tokens de entrada + 800 de salida). Los modelos
                    gratuitos tienen límites de uso y pueden ser lentos.
                  </small>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

const modelPrices = (m: AiModel) => `$${fmt(m.inPrice)} / $${fmt(m.outPrice)} por 1M tokens`
const fmt = (n: number) => (n === 0 ? '0' : n < 1 ? n.toFixed(2) : n.toFixed(n < 10 ? 2 : 0))
