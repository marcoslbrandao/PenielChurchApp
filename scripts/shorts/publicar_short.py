#!/usr/bin/env python3
"""
Shorts dos grupos (Peniel Church App, 12/11/2026) — roda no GitHub Actions.

1. Pede à Edge Function `shorts-trabalho` os dados do vídeo, o link (1 h) e um
   token do YouTube (1 h). O repositório é público: nenhum segredo aparece no
   log (o token é mascarado).
2. Prepara o vídeo:
   - até 3 min → vertical 1080x1920 (Short). Vídeo deitado ganha fundo
     desfocado em cima e embaixo;
   - mais de 3 min → mantém o formato (vídeo normal), até 1080p.
3. Legenda automática (faster-whisper, modelo "small") gravada no vídeo.
4. Arte "faixa": faixa na cor do grupo com o título (e subtítulo) no alto e
   "Peniel Church · Grupo" embaixo. Arte "limpa": só a legenda.
5. Sobe para o YouTube (com #Shorts quando é Short) e põe na playlist do grupo.
6. Avisa o app (concluir) — ou o erro.
"""
import json
import os
import subprocess
import sys
import textwrap
import urllib.request

SUPABASE_URL = os.environ['SUPABASE_URL'].rstrip('/')
SEGREDO = os.environ['SHORTS_SEGREDO']
SHORT_ID = os.environ['SHORT_ID']
BALCAO = f'{SUPABASE_URL}/functions/v1/shorts-trabalho'
FONTE = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

GRUPOS = {
    'jovens': ('Peniel Alive', '7B3FE4'),
    'mulheres': ('Mulheres', 'E64C93'),
    'homens': ('Homens', '2B6CB0'),
    'estudo_biblico': ('Estudo Bíblico', '1F8A70'),
    'infantil': ('Peniel Kids', 'F2B705'),
}


def balcao(dados: dict) -> dict:
    req = urllib.request.Request(BALCAO, data=json.dumps(dados).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'x-shorts-segredo': SEGREDO})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def rodar(cmd: list[str]):
    print('$', ' '.join(c if len(c) < 120 else c[:117] + '...' for c in cmd), flush=True)
    subprocess.run(cmd, check=True)


def sondar(caminho: str) -> dict:
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                          'stream=width,height:stream_tags=rotate:stream_side_data=rotation:format=duration',
                          '-of', 'json', caminho], capture_output=True, text=True, check=True).stdout
    j = json.loads(out)
    s = j['streams'][0]
    w, h = int(s['width']), int(s['height'])
    rot = 0
    try:
        rot = int(s.get('tags', {}).get('rotate', 0))
    except ValueError:
        pass
    for sd in s.get('side_data_list', []) or []:
        if 'rotation' in sd:
            rot = int(sd['rotation'])
    if abs(rot) in (90, 270):
        w, h = h, w
    return {'w': w, 'h': h, 'dur': float(j['format'].get('duration', 0) or 0)}


def legenda_srt(video: str, srt: str):
    from faster_whisper import WhisperModel
    modelo = WhisperModel('small', device='cpu', compute_type='int8')
    segs, info = modelo.transcribe(video, vad_filter=True, beam_size=1)
    print(f'idioma detectado: {info.language} ({info.language_probability:.2f})', flush=True)

    def ts(t):
        h, r = divmod(t, 3600)
        m, s = divmod(r, 60)
        return f'{int(h):02}:{int(m):02}:{int(s):02},{int((s - int(s)) * 1000):03}'

    n = 0
    with open(srt, 'w', encoding='utf-8') as f:
        for seg in segs:
            texto = seg.text.strip()
            if not texto:
                continue
            n += 1
            linhas = textwrap.wrap(texto, 38)[:2]
            f.write(f'{n}\n{ts(seg.start)} --> {ts(seg.end)}\n' + '\n'.join(linhas) + '\n\n')
    return n


def esc(caminho: str) -> str:
    # caminho dentro de filtro do ffmpeg
    return caminho.replace('\\', '\\\\').replace(':', '\\:').replace("'", "\\'")


def montar(entrada: str, saida: str, v: dict, info: dict, srt: str | None):
    grupo_nome, cor = GRUPOS.get(v['grupo'], (v['grupo'].capitalize(), '534AB7'))
    short = (v.get('duracao_s') or info['dur']) <= 180
    if short:
        W, H = 1080, 1920
        if info['w'] / max(info['h'], 1) > 0.7:  # deitado/quadrado: fundo desfocado
            base = (f'[0:v]split=2[a][b];[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:5,'
                    f'eq=brightness=-0.12[fundo];[b]scale={W}:-2[frente];[fundo][frente]overlay=(W-w)/2:(H-h)/2,setsar=1[v0]')
        else:
            base = f'[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1[v0]'
    else:
        H = 1080 if info['h'] >= info['w'] else min(1080, info['h'] - info['h'] % 2)
        base = f'[0:v]scale=-2:{H},setsar=1[v0]'
        W = None
    filtros = [base]
    atual = 'v0'
    if v.get('arte', 'faixa') == 'faixa':
        tam = 64 if short else 48
        linhas = textwrap.wrap(v['titulo'] or '', 24 if short else 40)[:3]
        for i, linha in enumerate(linhas):
            with open(f'titulo{i}.txt', 'w', encoding='utf-8') as f:
                f.write(linha)
        with open('rodape.txt', 'w', encoding='utf-8') as f:
            f.write(f'Peniel Church  ·  {grupo_nome}')
        altura_faixa = 90 + tam * 1.25 * len(linhas) + (60 if v.get('subtitulo') else 0)
        y0 = 150 if short else 40
        partes = [
            f"[{atual}]drawbox=x=0:y={y0}:w=iw:h={int(altura_faixa)}:color=0x{cor}@0.88:t=fill",
        ]
        # Uma linha por vez, cada uma centralizada.
        for i in range(len(linhas)):
            partes.append(f"drawtext=fontfile={FONTE}:textfile=titulo{i}.txt:fontsize={tam}:fontcolor=white:"
                          f"x=(w-text_w)/2:y={int(y0 + 45 + i * tam * 1.25)}")
        if v.get('subtitulo'):
            with open('subtitulo.txt', 'w', encoding='utf-8') as f:
                f.write(v['subtitulo'])
            partes.append(f"drawtext=fontfile={FONTE}:textfile=subtitulo.txt:fontsize={int(tam * 0.55)}:"
                          f"fontcolor=white@0.9:x=(w-text_w)/2:y={int(y0 + altura_faixa - 75)}")
        partes.append(f"drawtext=fontfile={FONTE}:textfile=rodape.txt:fontsize={34 if short else 26}:fontcolor=white:"
                      f"box=1:boxcolor=0x{cor}@0.85:boxborderw=18:x=(w-text_w)/2:y=h-{260 if short else 70}")
        filtros.append(','.join(partes) + '[v1]')
        atual = 'v1'
    if srt:
        estilo = ('FontName=DejaVu Sans,Bold=1,FontSize=' + ('9' if short else '14') + ',PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,'
                  'BackColour=&H99000000,BorderStyle=4,Outline=0,Shadow=0,Alignment=2,MarginV=' + ('55' if short else '22'))
        filtros.append(f"[{atual}]subtitles='{esc(srt)}':force_style='{estilo}'[v2]")
        atual = 'v2'
    rodar(['ffmpeg', '-y', '-i', entrada, '-filter_complex', ';'.join(filtros), '-map', f'[{atual}]', '-map', '0:a?',
           '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
           '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', saida])
    return short, grupo_nome


def youtube_upload(arquivo: str, token: str, titulo: str, descricao: str) -> str:
    import requests
    meta = {
        'snippet': {'title': titulo[:100], 'description': descricao[:4900], 'categoryId': '29',
                    'defaultLanguage': 'pt-BR', 'defaultAudioLanguage': 'pt-BR',
                    'tags': ['Peniel Church', 'Reading', 'igreja', 'Shorts']},
        'status': {'privacyStatus': 'public', 'selfDeclaredMadeForKids': False, 'embeddable': True},
    }
    r = requests.post('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
                      headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json; charset=UTF-8',
                               'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': str(os.path.getsize(arquivo))},
                      data=json.dumps(meta), timeout=60)
    r.raise_for_status()
    destino = r.headers['Location']
    with open(arquivo, 'rb') as f:
        up = requests.put(destino, data=f, headers={'Authorization': f'Bearer {token}', 'Content-Type': 'video/mp4'}, timeout=1800)
    up.raise_for_status()
    vid = up.json()
    print('YouTube:', vid.get('id'), vid.get('status', {}).get('privacyStatus'),
          vid.get('status', {}).get('uploadStatus'), flush=True)
    return vid['id']


def playlist(token: str, playlist_id: str, video_id: str):
    import requests
    r = requests.post('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet',
                      headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
                      data=json.dumps({'snippet': {'playlistId': playlist_id,
                                                   'resourceId': {'kind': 'youtube#video', 'videoId': video_id}}}), timeout=60)
    if not r.ok:
        print('aviso: não entrou na playlist:', r.status_code, r.text[:200], flush=True)


def main():
    dados = balcao({'acao': 'iniciar', 'id': SHORT_ID})
    if 'error' in dados:
        print('não iniciou:', dados['error'])
        sys.exit(1)
    token = dados['youtube_token']
    print(f'::add-mask::{token}', flush=True)
    v = dados['video']
    try:
        urllib.request.urlretrieve(dados['video_url'], 'entrada.mp4')
        info = sondar('entrada.mp4')
        print('vídeo:', info, flush=True)
        srt = None
        if v.get('legendas', True):
            if legenda_srt('entrada.mp4', 'legenda.srt') > 0:
                srt = os.path.abspath('legenda.srt')
        short, grupo_nome = montar('entrada.mp4', 'saida.mp4', v, info, srt)
        titulo = (v['titulo'] or 'Peniel Church').strip()
        if short and '#shorts' not in titulo.lower():
            titulo = f'{titulo} #Shorts'
        descricao = '\n'.join(x for x in [
            v.get('subtitulo') or '',
            '',
            f'{grupo_nome} · Peniel Church (Reading, UK)',
            'Baixe o app da igreja: https://app.penielchurch.org.uk',
        ] if x is not None)
        vid = youtube_upload('saida.mp4', token, titulo, descricao)
        if dados.get('playlist_id'):
            playlist(token, dados['playlist_id'], vid)
        balcao({'acao': 'concluir', 'id': SHORT_ID, 'youtube_id': vid})
        print('PUBLICADO', vid, flush=True)
    except Exception as e:  # noqa: BLE001
        msg = str(e)[:400]
        print('ERRO:', msg, flush=True)
        try:
            balcao({'acao': 'erro', 'id': SHORT_ID, 'erro': msg})
        finally:
            sys.exit(1)


if __name__ == '__main__':
    main()
