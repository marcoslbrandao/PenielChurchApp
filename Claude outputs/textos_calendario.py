#!/usr/bin/env python3
# Textos do calendário anual (11/11/2026) nos 4 idiomas do app.
# Uso: python3 "Claude outputs/textos_calendario.py" (na raiz do projeto)
import json, collections

T = {
 'pt': dict(
  quick='Calendário',
  subtitulo='calendário da igreja', abaSemana='Esta semana', abaCalendario='Calendário', abaAno='Ano',
  todas='Todas', nenhumaNoMes='Nenhuma data marcada neste mês ainda.', nenhumaNoDia='Nada marcado neste dia.',
  adicionarMeu='Adicionar ao meu calendário', adicionarMeuSub='As datas da igreja no seu celular, sempre atualizadas',
  assinarTitulo='Levar para o meu calendário', assinarExplica='As datas entram no calendário do seu celular e as novas chegam sozinhas.',
  tudo='Todas as datas da igreja', soEscolhidas='Só as que eu escolher', escolhaUma='Escolha pelo menos uma categoria.',
  assinar='Adicionar ao calendário',
  notaIphone='O iPhone vai perguntar "Assinar calendário?" — toque em Assinar.',
  notaAndroid='Abre o Google Agenda — toque em Adicionar.',
  erroAbrir='Não foi possível abrir o calendário do celular.',
  adicionarData='Adicionar esta data ao meu calendário', diaInteiro='Dia inteiro',
  novaData='Nova data', editarData='Editar data', categoria='Categoria', titulo='Título', tituloEx='Ex.: Conferência de Páscoa',
  dataInicio='Data', dataFim='Até (opcional)', horaInicio='Início', horaFim='Fim (opcional)',
  local='Local (opcional)', descricao='Descrição (opcional)', salvar='Salvar', apagar='Apagar esta data',
  apagarTitulo='Apagar esta data?', apagarTexto='"{{titulo}}" sai do calendário de todos.',
  erroTitulo='Escreva o título.', erroData='Data inválida. Use DD/MM/AAAA.', erroDataFim='A data final é antes da inicial.',
  erroHora='Hora inválida. Use HH:MM.', maisN='+{{n}} datas', toqueMes='Toque num mês para ver os dias.',
  diasCurtos=['D', 'S', 'T', 'Q', 'Q', 'S', 'S'],
  adminTitulo='Calendário anual', adminExplica='Cores, emojis e quem edita cada categoria. Os líderes de Alive, Mulheres e Homens já editam a sua. As datas se editam na Agenda › Calendário.',
  liderDoGrupo='O líder do {{grupo}} edita', adicionarEditor='Editor', oculta='oculta',
  editarCategoria='Editar categoria', nome='Nome', emoji='Emoji', cor='Cor', mostrar='Mostrar no calendário',
  quemEdita='Quem mais edita {{cat}}', removerEditorTitulo='Tirar este editor?', removerEditorTexto='{{nome}} deixa de editar esta categoria.', remover='Tirar',
  cat=dict(ceia='Ceia', conferencia='Conferências', retiro='Retiros', alive='Alive', mulheres='Mulheres', homens='Homens', kids='Kids', oracao='Oração e jejum', especial='Datas especiais', fechada='Igreja fechada'),
 ),
 'en': dict(
  quick='Calendar',
  subtitulo='church calendar', abaSemana='This week', abaCalendario='Calendar', abaAno='Year',
  todas='All', nenhumaNoMes='No dates this month yet.', nenhumaNoDia='Nothing on this day.',
  adicionarMeu='Add to my calendar', adicionarMeuSub='Church dates on your phone, always up to date',
  assinarTitulo='Add to my calendar', assinarExplica='The dates go into your phone calendar and new ones arrive automatically.',
  tudo='All church dates', soEscolhidas='Only the ones I choose', escolhaUma='Choose at least one category.',
  assinar='Add to calendar',
  notaIphone='Your iPhone will ask "Subscribe to calendar?" — tap Subscribe.',
  notaAndroid='Google Calendar will open — tap Add.',
  erroAbrir="Couldn't open your phone calendar.",
  adicionarData='Add this date to my calendar', diaInteiro='All day',
  novaData='New date', editarData='Edit date', categoria='Category', titulo='Title', tituloEx='E.g. Easter Conference',
  dataInicio='Date', dataFim='Until (optional)', horaInicio='Start', horaFim='End (optional)',
  local='Location (optional)', descricao='Description (optional)', salvar='Save', apagar='Delete this date',
  apagarTitulo='Delete this date?', apagarTexto='"{{titulo}}" will be removed from everyone\'s calendar.',
  erroTitulo='Write the title.', erroData='Invalid date. Use DD/MM/YYYY.', erroDataFim='The end date is before the start date.',
  erroHora='Invalid time. Use HH:MM.', maisN='+{{n}} dates', toqueMes='Tap a month to see the days.',
  diasCurtos=['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  adminTitulo='Annual calendar', adminExplica='Colours, emojis and who edits each category. Alive, Women and Men leaders already edit theirs. Dates are edited in Agenda › Calendar.',
  liderDoGrupo='The {{grupo}} leader edits', adicionarEditor='Editor', oculta='hidden',
  editarCategoria='Edit category', nome='Name', emoji='Emoji', cor='Colour', mostrar='Show in calendar',
  quemEdita='Who else edits {{cat}}', removerEditorTitulo='Remove this editor?', removerEditorTexto='{{nome}} will no longer edit this category.', remover='Remove',
  cat=dict(ceia='Communion', conferencia='Conferences', retiro='Retreats', alive='Alive', mulheres='Women', homens='Men', kids='Kids', oracao='Prayer & fasting', especial='Special dates', fechada='Church closed'),
 ),
 'es': dict(
  quick='Calendario',
  subtitulo='calendario de la iglesia', abaSemana='Esta semana', abaCalendario='Calendario', abaAno='Año',
  todas='Todas', nenhumaNoMes='Aún no hay fechas este mes.', nenhumaNoDia='Nada este día.',
  adicionarMeu='Añadir a mi calendario', adicionarMeuSub='Las fechas de la iglesia en tu móvil, siempre al día',
  assinarTitulo='Llevar a mi calendario', assinarExplica='Las fechas entran en el calendario de tu móvil y las nuevas llegan solas.',
  tudo='Todas las fechas de la iglesia', soEscolhidas='Solo las que yo elija', escolhaUma='Elige al menos una categoría.',
  assinar='Añadir al calendario',
  notaIphone='El iPhone preguntará "¿Suscribirse al calendario?" — toca Suscribirse.',
  notaAndroid='Se abrirá Google Calendar — toca Añadir.',
  erroAbrir='No se pudo abrir el calendario del móvil.',
  adicionarData='Añadir esta fecha a mi calendario', diaInteiro='Todo el día',
  novaData='Nueva fecha', editarData='Editar fecha', categoria='Categoría', titulo='Título', tituloEx='Ej.: Conferencia de Pascua',
  dataInicio='Fecha', dataFim='Hasta (opcional)', horaInicio='Inicio', horaFim='Fin (opcional)',
  local='Lugar (opcional)', descricao='Descripción (opcional)', salvar='Guardar', apagar='Borrar esta fecha',
  apagarTitulo='¿Borrar esta fecha?', apagarTexto='"{{titulo}}" saldrá del calendario de todos.',
  erroTitulo='Escribe el título.', erroData='Fecha no válida. Usa DD/MM/AAAA.', erroDataFim='La fecha final es anterior a la inicial.',
  erroHora='Hora no válida. Usa HH:MM.', maisN='+{{n}} fechas', toqueMes='Toca un mes para ver los días.',
  diasCurtos=['D', 'L', 'M', 'X', 'J', 'V', 'S'],
  adminTitulo='Calendario anual', adminExplica='Colores, emojis y quién edita cada categoría. Los líderes de Alive, Mujeres y Hombres ya editan la suya. Las fechas se editan en Agenda › Calendario.',
  liderDoGrupo='El líder de {{grupo}} edita', adicionarEditor='Editor', oculta='oculta',
  editarCategoria='Editar categoría', nome='Nombre', emoji='Emoji', cor='Color', mostrar='Mostrar en el calendario',
  quemEdita='Quién más edita {{cat}}', removerEditorTitulo='¿Quitar a este editor?', removerEditorTexto='{{nome}} dejará de editar esta categoría.', remover='Quitar',
  cat=dict(ceia='Santa Cena', conferencia='Conferencias', retiro='Retiros', alive='Alive', mulheres='Mujeres', homens='Hombres', kids='Kids', oracao='Oración y ayuno', especial='Fechas especiales', fechada='Iglesia cerrada'),
 ),
 'fr': dict(
  quick='Calendrier',
  subtitulo="calendrier de l'église", abaSemana='Cette semaine', abaCalendario='Calendrier', abaAno='Année',
  todas='Toutes', nenhumaNoMes='Aucune date ce mois-ci pour le moment.', nenhumaNoDia='Rien ce jour-là.',
  adicionarMeu='Ajouter à mon calendrier', adicionarMeuSub="Les dates de l'église sur votre téléphone, toujours à jour",
  assinarTitulo='Ajouter à mon calendrier', assinarExplica='Les dates arrivent dans le calendrier de votre téléphone et les nouvelles s’ajoutent toutes seules.',
  tudo="Toutes les dates de l'église", soEscolhidas='Seulement celles que je choisis', escolhaUma='Choisissez au moins une catégorie.',
  assinar='Ajouter au calendrier',
  notaIphone="L'iPhone demandera « S'abonner au calendrier ? » — touchez S'abonner.",
  notaAndroid="Google Agenda s'ouvrira — touchez Ajouter.",
  erroAbrir="Impossible d'ouvrir le calendrier du téléphone.",
  adicionarData='Ajouter cette date à mon calendrier', diaInteiro='Toute la journée',
  novaData='Nouvelle date', editarData='Modifier la date', categoria='Catégorie', titulo='Titre', tituloEx='Ex. : Conférence de Pâques',
  dataInicio='Date', dataFim="Jusqu'au (facultatif)", horaInicio='Début', horaFim='Fin (facultatif)',
  local='Lieu (facultatif)', descricao='Description (facultatif)', salvar='Enregistrer', apagar='Supprimer cette date',
  apagarTitulo='Supprimer cette date ?', apagarTexto='« {{titulo}} » sera retiré du calendrier de tous.',
  erroTitulo='Écrivez le titre.', erroData='Date invalide. Utilisez JJ/MM/AAAA.', erroDataFim='La date de fin est avant la date de début.',
  erroHora='Heure invalide. Utilisez HH:MM.', maisN='+{{n}} dates', toqueMes='Touchez un mois pour voir les jours.',
  diasCurtos=['D', 'L', 'M', 'M', 'J', 'V', 'S'],
  adminTitulo='Calendrier annuel', adminExplica='Couleurs, emojis et qui modifie chaque catégorie. Les responsables Alive, Femmes et Hommes modifient déjà la leur. Les dates se modifient dans Agenda › Calendrier.',
  liderDoGrupo='Le responsable {{grupo}} modifie', adicionarEditor='Éditeur', oculta='masquée',
  editarCategoria='Modifier la catégorie', nome='Nom', emoji='Emoji', cor='Couleur', mostrar='Afficher dans le calendrier',
  quemEdita='Qui d’autre modifie {{cat}}', removerEditorTitulo='Retirer cet éditeur ?', removerEditorTexto='{{nome}} ne modifiera plus cette catégorie.', remover='Retirer',
  cat=dict(ceia='Sainte-Cène', conferencia='Conférences', retiro='Retraites', alive='Alive', mulheres='Femmes', homens='Hommes', kids='Kids', oracao='Prière et jeûne', especial='Dates spéciales', fechada='Église fermée'),
 ),
}

# Ligar data a evento com inscrição (Retiro Peniel 2027 etc.)
for _l, (_a, _b) in {'pt': ('Ligar a um evento com inscrição', 'Sem inscrição'), 'en': ('Link to an event with registration', 'No registration'),
                     'es': ('Vincular a un evento con inscripción', 'Sin inscripción'), 'fr': ('Lier à un événement avec inscription', 'Sans inscription')}.items():
    T[_l]['ligarEvento'] = _a; T[_l]['semInscricao'] = _b

for lang, v in T.items():
    p = f'locales/{lang}.json'
    d = json.load(open(p, encoding='utf-8'), object_pairs_hook=collections.OrderedDict)
    v = dict(v)
    d['home']['quickCalendario'] = v.pop('quick')
    d['calendario'] = v
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(lang, 'ok', len(v))
