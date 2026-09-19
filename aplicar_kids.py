#!/usr/bin/env python3
# aplicar_kids.py — acrescenta as chaves `kids` aos quatro idiomas e registra a
# tela PenielKids no navegador. Roda de dentro da raiz do projeto.
#
# Idempotente: rodar duas vezes não duplica nada.

import json, re, sys, pathlib

RAIZ = pathlib.Path(__file__).resolve().parent
if not (RAIZ / 'App.tsx').exists():
    print('ERRO: rode este script na raiz do PenielChurchApp'); sys.exit(1)

KIDS = {
 'pt': {
  "titulo": "Peniel Kids",
  "semFilhos": "Você ainda não cadastrou nenhum filho. Adicione no seu cadastro para receber o material da semana.",
  "irAoCadastro": "Ir ao meu cadastro",
  "semLicao": "O material da próxima aula ainda não foi publicado.",
  "erroKit": "Não foi possível carregar o material desta semana.",
  "licaoN": "Lição {{n}}",
  "trilhaJardim": "Jardim · 4 a 6 anos",
  "trilhaExploradores": "Exploradores · 7 a 10 anos",
  "aulaDe": "Aula de {{data}}",
  "carimbada": "Carimbada",
  "versiculo": "Versículo",
  "historia": "A história",
  "video": "O vídeo da semana",
  "musica": "Para cantar",
  "atividade": "Atividade para imprimir",
  "devocional": "Para conversar em casa",
  "anos": "{{n}} anos",
  "alergias": "Alergias",
  "necessidades": "Necessidades especiais",
  "infoResponsavel": "Informado pelo responsável",
  "fichaTitulo": "Ficha da sala",
  "fichaVazia": "Nenhuma criança no grupo infantil ainda.",
  "fichaAviso": "O que a sala precisa saber sobre cada criança neste domingo.",
  "fichaTrava": "Telefone, endereço e as observações internas da liderança não aparecem aqui — a sala vê o que a sala precisa."
 },
 'en': {
  "titulo": "Peniel Kids",
  "semFilhos": "You haven't added any children yet. Add them to your profile to receive the weekly material.",
  "irAoCadastro": "Go to my profile",
  "semLicao": "The material for the next lesson hasn't been published yet.",
  "erroKit": "We couldn't load this week's material.",
  "licaoN": "Lesson {{n}}",
  "trilhaJardim": "Garden · ages 4 to 6",
  "trilhaExploradores": "Explorers · ages 7 to 10",
  "aulaDe": "Lesson of {{data}}",
  "carimbada": "Stamped",
  "versiculo": "Verse",
  "historia": "The story",
  "video": "This week's video",
  "musica": "To sing",
  "atividade": "Printable activity",
  "devocional": "To talk about at home",
  "anos": "{{n}} years old",
  "alergias": "Allergies",
  "necessidades": "Special needs",
  "infoResponsavel": "Told us by the parent",
  "fichaTitulo": "Classroom sheet",
  "fichaVazia": "No children in the kids group yet.",
  "fichaAviso": "What the classroom needs to know about each child this Sunday.",
  "fichaTrava": "Phone, address and the leadership's internal notes don't appear here — the classroom sees what the classroom needs."
 },
 'es': {
  "titulo": "Peniel Kids",
  "semFilhos": "Aún no has registrado ningún hijo. Agrégalo en tu perfil para recibir el material de la semana.",
  "irAoCadastro": "Ir a mi perfil",
  "semLicao": "El material de la próxima clase todavía no fue publicado.",
  "erroKit": "No pudimos cargar el material de esta semana.",
  "licaoN": "Lección {{n}}",
  "trilhaJardim": "Jardín · 4 a 6 años",
  "trilhaExploradores": "Exploradores · 7 a 10 años",
  "aulaDe": "Clase del {{data}}",
  "carimbada": "Sellada",
  "versiculo": "Versículo",
  "historia": "La historia",
  "video": "El video de la semana",
  "musica": "Para cantar",
  "atividade": "Actividad para imprimir",
  "devocional": "Para conversar en casa",
  "anos": "{{n}} años",
  "alergias": "Alergias",
  "necessidades": "Necesidades especiales",
  "infoResponsavel": "Informado por el responsable",
  "fichaTitulo": "Ficha del aula",
  "fichaVazia": "Todavía no hay niños en el grupo infantil.",
  "fichaAviso": "Lo que el aula necesita saber sobre cada niño este domingo.",
  "fichaTrava": "El teléfono, la dirección y las observaciones internas del liderazgo no aparecen aquí — el aula ve lo que el aula necesita."
 },
 'fr': {
  "titulo": "Peniel Kids",
  "semFilhos": "Vous n'avez encore ajouté aucun enfant. Ajoutez-le à votre profil pour recevoir le matériel de la semaine.",
  "irAoCadastro": "Aller à mon profil",
  "semLicao": "Le matériel de la prochaine leçon n'a pas encore été publié.",
  "erroKit": "Impossible de charger le matériel de cette semaine.",
  "licaoN": "Leçon {{n}}",
  "trilhaJardim": "Jardin · 4 à 6 ans",
  "trilhaExploradores": "Explorateurs · 7 à 10 ans",
  "aulaDe": "Leçon du {{data}}",
  "carimbada": "Tamponnée",
  "versiculo": "Verset",
  "historia": "L'histoire",
  "video": "La vidéo de la semaine",
  "musica": "Pour chanter",
  "atividade": "Activité à imprimer",
  "devocional": "Pour en parler à la maison",
  "anos": "{{n}} ans",
  "alergias": "Allergies",
  "necessidades": "Besoins particuliers",
  "infoResponsavel": "Indiqué par le responsable",
  "fichaTitulo": "Fiche de la salle",
  "fichaVazia": "Aucun enfant dans le groupe des enfants pour l'instant.",
  "fichaAviso": "Ce que la salle doit savoir sur chaque enfant ce dimanche.",
  "fichaTrava": "Téléphone, adresse et les notes internes des responsables n'apparaissent pas ici — la salle voit ce dont la salle a besoin."
 },
}

# ─── 1. locales ───────────────────────────────────────────────────────────────
for idioma, bloco in KIDS.items():
    p = RAIZ / 'locales' / f'{idioma}.json'
    d = json.loads(p.read_text(encoding='utf-8'))
    atual = d.get('kids', {})
    # chaves já traduzidas à mão pelo Marcos continuam valendo
    d['kids'] = {**bloco, **atual}
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'locales/{idioma}.json: bloco kids com {len(d["kids"])} chaves')

# ─── 2. App.tsx ───────────────────────────────────────────────────────────────
app = RAIZ / 'App.tsx'
s = app.read_text(encoding='utf-8')

if 'PenielKidsScreen' in s:
    print('App.tsx: já registrado, nada a fazer')
else:
    imp = "import AniversariantesScreen from './screens/AniversariantesScreen';"
    assert imp in s, 'não achei o import de AniversariantesScreen'
    s = s.replace(imp, imp + "\nimport PenielKidsScreen from './screens/PenielKidsScreen';", 1)

    alvo = """              <Stack.Screen
                name="Aniversariantes"
                component={AniversariantesScreen}
                options={{ presentation: 'modal' }}
              />"""
    assert alvo in s, 'não achei o Stack.Screen de Aniversariantes'
    novo = alvo + """
              <Stack.Screen
                name="PenielKids"
                component={PenielKidsScreen}
                options={{ presentation: 'modal' }}
              />"""
    s = s.replace(alvo, novo, 1)
    app.write_text(s, encoding='utf-8')
    print('App.tsx: tela PenielKids registrada')

print('\npronto.')
