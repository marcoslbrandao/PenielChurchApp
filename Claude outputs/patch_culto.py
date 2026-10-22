import json, sys, os
os.chdir(sys.argv[1])

PT = {
  "intro": "Preencha o culto de domingo e publique: o app cria o live agendado no YouTube com título, descrição e thumb. No OBS, escolha \"Selecionar transmissão existente\".",
  "novo": "Novo culto", "proximos": "Próximos", "anteriores": "Anteriores",
  "nenhumProximo": "Nenhum culto agendado ainda.",
  "statusRascunho": "Rascunho — ainda não está no YouTube", "statusNoYoutube": "Agendado no YouTube",
  "statusComAviso": "No YouTube, com aviso", "voltar": "Cultos",
  "dicaThumb": "Prévia da thumb. Para quebrar a linha do tema onde quiser, use Enter.",
  "agendadoNoYoutube": "Live agendado no YouTube", "abrir": "Abrir",
  "tipo": "Tipo de culto", "data": "Data", "hora": "Hora",
  "tema": "Tema da mensagem", "temaExemplo": "Ex.: Alargando as tendas",
  "subtitulo": "Subtítulo (opcional)", "subtituloExemplo": "Ex.: para um novo tempo",
  "referencia": "Texto base (opcional)", "pregador": "Pregador",
  "foto": "Foto do pregador", "semFoto": "Sem foto", "enviarFoto": "Enviar",
  "dicaFoto": "Use foto já recortada, sem fundo (PNG). Pregador visitante: peça a foto e mande para recortar.",
  "observacao": "Texto extra na descrição (opcional)", "observacaoExemplo": "Ex.: Hoje teremos batismo.",
  "publicarYoutube": "Publicar no YouTube", "atualizarYoutube": "Atualizar no YouTube",
  "salvarRascunho": "Salvar rascunho", "removerDoYoutube": "Remover do YouTube", "excluir": "Excluir",
  "jaPassou": "Esse culto já passou — o live não pode mais ser alterado por aqui.",
  "dataInvalida": "Confira a data (DD/MM/AAAA).", "horaInvalida": "Confira a hora (ex.: 18:00).",
  "temaObrigatorio": "Preencha o tema.", "pregadorObrigatorio": "Preencha o pregador.",
  "erroThumb": "Não deu para salvar a thumb", "salvo": "Salvo",
  "salvoTexto": "Rascunho salvo. Quando quiser, toque em \"Publicar no YouTube\".",
  "erroYoutube": "YouTube", "publicado": "Live agendado ✅", "atualizado": "Live atualizado ✅",
  "publicadoTexto": "No domingo, no OBS: Gerenciar transmissão → Selecionar transmissão existente → escolha este culto.",
  "removerTitulo": "Remover do YouTube?", "removerTexto": "O live agendado será apagado do canal. O rascunho continua aqui no app.",
  "remover": "Remover", "excluirTitulo": "Excluir este culto?", "excluirTexto": "O rascunho e a thumb serão apagados.",
  "fotoSemRecorte": "Essa foto não é PNG — provavelmente tem fundo. Funciona, mas a thumb fica melhor com a foto recortada.",
  "fotoNaoCarregou": "A foto do pregador não carregou. Confira a internet ou escolha outra foto."
}
EN = {
  "intro": "Fill in Sunday's service and publish: the app creates the scheduled YouTube live with title, description and thumbnail. In OBS, choose \"Select existing broadcast\".",
  "novo": "New service", "proximos": "Upcoming", "anteriores": "Previous",
  "nenhumProximo": "No service scheduled yet.",
  "statusRascunho": "Draft — not on YouTube yet", "statusNoYoutube": "Scheduled on YouTube",
  "statusComAviso": "On YouTube, with a warning", "voltar": "Services",
  "dicaThumb": "Thumbnail preview. Press Enter to break the title line where you want.",
  "agendadoNoYoutube": "Live scheduled on YouTube", "abrir": "Open",
  "tipo": "Service type", "data": "Date", "hora": "Time",
  "tema": "Sermon title", "temaExemplo": "e.g. Enlarge your tent",
  "subtitulo": "Subtitle (optional)", "subtituloExemplo": "e.g. for a new season",
  "referencia": "Bible passage (optional)", "pregador": "Preacher",
  "foto": "Preacher photo", "semFoto": "No photo", "enviarFoto": "Upload",
  "dicaFoto": "Use a cut-out photo with no background (PNG). Guest preacher: ask for a photo and send it to be cut out.",
  "observacao": "Extra text in the description (optional)", "observacaoExemplo": "e.g. Baptisms today.",
  "publicarYoutube": "Publish on YouTube", "atualizarYoutube": "Update on YouTube",
  "salvarRascunho": "Save draft", "removerDoYoutube": "Remove from YouTube", "excluir": "Delete",
  "jaPassou": "This service has passed — the live can no longer be changed here.",
  "dataInvalida": "Check the date (DD/MM/YYYY).", "horaInvalida": "Check the time (e.g. 18:00).",
  "temaObrigatorio": "Fill in the title.", "pregadorObrigatorio": "Fill in the preacher.",
  "erroThumb": "Couldn't save the thumbnail", "salvo": "Saved",
  "salvoTexto": "Draft saved. Tap \"Publish on YouTube\" when ready.",
  "erroYoutube": "YouTube", "publicado": "Live scheduled ✅", "atualizado": "Live updated ✅",
  "publicadoTexto": "On Sunday, in OBS: Manage broadcast → Select existing broadcast → pick this service.",
  "removerTitulo": "Remove from YouTube?", "removerTexto": "The scheduled live will be deleted from the channel. The draft stays here in the app.",
  "remover": "Remove", "excluirTitulo": "Delete this service?", "excluirTexto": "The draft and thumbnail will be deleted.",
  "fotoSemRecorte": "This photo isn't a PNG — it probably has a background. It works, but the thumbnail looks better with a cut-out photo.",
  "fotoNaoCarregou": "The preacher photo didn't load. Check the connection or pick another photo."
}
ABA = {"pt": "Culto", "en": "Service", "es": "Culto", "fr": "Culte"}

for l in ["pt", "en", "es", "fr"]:
    p = f"locales/{l}.json"
    original = open(p, encoding="utf-8").read()
    d = json.loads(original)
    assert json.dumps(d, ensure_ascii=False, indent=2) + "\n" == original or json.dumps(d, ensure_ascii=False, indent=2) == original, f"formato diferente em {l}"
    fim = "\n" if original.endswith("\n") else ""
    # aba logo depois de aba_avisos
    adm = d["admin"]
    novo = {}
    for k, v in adm.items():
        novo[k] = v
        if k == "aba_avisos":
            novo["aba_culto"] = ABA[l]
    if "aba_culto" not in novo:
        novo["aba_culto"] = ABA[l]
    d["admin"] = novo
    d["cultoSemana"] = PT if l == "pt" else EN if l == "en" else {**EN, **d.get("cultoSemana", {})} if False else (PT if l == "es" else EN)
    open(p, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False, indent=2) + fim)
print("locales ok")

p = "screens/AdminScreen.tsx"
s = open(p, encoding="utf-8").read()
def troca(a, b, n=1):
    global s
    c = s.count(a)
    assert c == n, (a[:60], c)
    s = s.replace(a, b)
troca("import DenunciasAdmin from '../components/DenunciasAdmin';",
      "import DenunciasAdmin from '../components/DenunciasAdmin';\nimport CultoDaSemanaAdmin from '../components/CultoDaSemanaAdmin';")
troca("useState<'convites' | 'stats' | 'ofertas' | 'avisos' |",
      "useState<'convites' | 'stats' | 'ofertas' | 'avisos' | 'culto' |")
troca("? (['avisos', 'denuncias', 'devocionais',",
      "? (['avisos', 'culto', 'denuncias', 'devocionais',")
troca("name={tab === 'avisos' ? 'megaphone-outline' :",
      "name={tab === 'avisos' ? 'megaphone-outline' : tab === 'culto' ? 'videocam-outline' :")
troca("abaAtual !== 'stats' && abaAtual !== 'denuncias' && (",
      "abaAtual !== 'stats' && abaAtual !== 'denuncias' && abaAtual !== 'culto' && (")
troca("          {/* ══ TEXTOS ═══════════════════════════════════════════════════════ */}\n          {abaAtual === 'textos' && <TextosAppEditor />}",
      "          {/* ══ CULTO DA SEMANA ══════════════════════════════════════════════ */}\n          {abaAtual === 'culto' && <CultoDaSemanaAdmin C={C} />}\n\n          {/* ══ TEXTOS ═══════════════════════════════════════════════════════ */}\n          {abaAtual === 'textos' && <TextosAppEditor />}")
open(p, "w", encoding="utf-8").write(s)
print("admin ok")

p = "supabase/config.toml"
s = open(p, encoding="utf-8").read()
if "[functions.youtube-culto]" not in s:
    s = s.rstrip("\n") + "\n\n# Culto da semana (21/10/2026): o app manda o JWT do Admin; a funcao confere\n# is_admin() por dentro.\n[functions.youtube-culto]\nenabled = true\nverify_jwt = false\nentrypoint = \"./functions/youtube-culto/index.ts\"\n"
    open(p, "w", encoding="utf-8").write(s)
print("config ok")
