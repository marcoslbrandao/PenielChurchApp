#!/usr/bin/env python3
# Textos: editar evento + "Só inscrição" x "Inscrição e pagamento" (12/11/2026).
import json, collections
T = {
 'pt': {
  'admin.editar': 'Editar', 'admin.editarEvento': 'Editar evento', 'admin.inscricoes': 'Inscrições',
  'admin.inscricoesBotao': 'Inscrições', 'admin.insc_nenhuma': 'Sem inscrição', 'admin.insc_gratis': '✅ Só inscrição',
  'admin.insc_paga': '💳 Com pagamento',
  'admin.insc_nenhuma_dica': 'O evento só aparece na Agenda.',
  'admin.insc_gratis_dica': 'A pessoa se inscreve para confirmar a vaga, sem pagar nada.',
  'admin.insc_paga_dica': 'Inscrição com valores por idade e pagamento pelo app. Ajuste valores, vagas e datas no botão Inscrições.',
  'admin.inscricaoTemPagamentos': 'Este evento já tem pagamentos registrados, por isso não dá para tirar a cobrança.',
  'eventos.inscritoOkSemPagamento': 'Inscrição feita! Sua vaga está confirmada.',
  'eventos.vagaConfirmada': '✅ Vaga confirmada', 'eventos.resumoPessoas': '{{n}} pessoa(s)',
  'eventos.cfgComPagamento': 'Com pagamento',
  'eventos.cfgComPagamentoSim': 'Valores por idade e pagamento pelo app.',
  'eventos.cfgComPagamentoNao': 'Só inscrição: confirma a vaga, sem valores.',
 },
 'en': {
  'admin.editar': 'Edit', 'admin.editarEvento': 'Edit event', 'admin.inscricoes': 'Registration',
  'admin.inscricoesBotao': 'Registration', 'admin.insc_nenhuma': 'No registration', 'admin.insc_gratis': '✅ Sign-up only',
  'admin.insc_paga': '💳 With payment',
  'admin.insc_nenhuma_dica': 'The event only shows in the Agenda.',
  'admin.insc_gratis_dica': 'People sign up to confirm their place, without paying.',
  'admin.insc_paga_dica': 'Registration with prices by age and payment in the app. Adjust prices, places and dates in the Registration button.',
  'admin.inscricaoTemPagamentos': 'This event already has payments recorded, so payment can’t be turned off.',
  'eventos.inscritoOkSemPagamento': 'You’re registered! Your place is confirmed.',
  'eventos.vagaConfirmada': '✅ Place confirmed', 'eventos.resumoPessoas': '{{n}} person(s)',
  'eventos.cfgComPagamento': 'With payment',
  'eventos.cfgComPagamentoSim': 'Prices by age and payment in the app.',
  'eventos.cfgComPagamentoNao': 'Sign-up only: confirms the place, no prices.',
 },
 'es': {
  'admin.editar': 'Editar', 'admin.editarEvento': 'Editar evento', 'admin.inscricoes': 'Inscripciones',
  'admin.inscricoesBotao': 'Inscripciones', 'admin.insc_nenhuma': 'Sin inscripción', 'admin.insc_gratis': '✅ Solo inscripción',
  'admin.insc_paga': '💳 Con pago',
  'admin.insc_nenhuma_dica': 'El evento solo aparece en la Agenda.',
  'admin.insc_gratis_dica': 'La persona se inscribe para confirmar su plaza, sin pagar nada.',
  'admin.insc_paga_dica': 'Inscripción con precios por edad y pago en la app. Ajusta precios, plazas y fechas en el botón Inscripciones.',
  'admin.inscricaoTemPagamentos': 'Este evento ya tiene pagos registrados, por eso no se puede quitar el cobro.',
  'eventos.inscritoOkSemPagamento': '¡Inscripción hecha! Tu plaza está confirmada.',
  'eventos.vagaConfirmada': '✅ Plaza confirmada', 'eventos.resumoPessoas': '{{n}} persona(s)',
  'eventos.cfgComPagamento': 'Con pago',
  'eventos.cfgComPagamentoSim': 'Precios por edad y pago en la app.',
  'eventos.cfgComPagamentoNao': 'Solo inscripción: confirma la plaza, sin precios.',
 },
 'fr': {
  'admin.editar': 'Modifier', 'admin.editarEvento': 'Modifier l’événement', 'admin.inscricoes': 'Inscriptions',
  'admin.inscricoesBotao': 'Inscriptions', 'admin.insc_nenhuma': 'Sans inscription', 'admin.insc_gratis': '✅ Inscription seule',
  'admin.insc_paga': '💳 Avec paiement',
  'admin.insc_nenhuma_dica': 'L’événement apparaît seulement dans l’Agenda.',
  'admin.insc_gratis_dica': 'On s’inscrit pour confirmer sa place, sans rien payer.',
  'admin.insc_paga_dica': 'Inscription avec tarifs par âge et paiement dans l’app. Réglez tarifs, places et dates dans le bouton Inscriptions.',
  'admin.inscricaoTemPagamentos': 'Cet événement a déjà des paiements enregistrés : impossible de retirer le paiement.',
  'eventos.inscritoOkSemPagamento': 'Inscription faite ! Votre place est confirmée.',
  'eventos.vagaConfirmada': '✅ Place confirmée', 'eventos.resumoPessoas': '{{n}} personne(s)',
  'eventos.cfgComPagamento': 'Avec paiement',
  'eventos.cfgComPagamentoSim': 'Tarifs par âge et paiement dans l’app.',
  'eventos.cfgComPagamentoNao': 'Inscription seule : confirme la place, sans tarifs.',
 },
}
for l, v in T.items():
    p = f'locales/{l}.json'
    d = json.load(open(p, encoding='utf-8'), object_pairs_hook=collections.OrderedDict)
    for k, val in v.items():
        ns, key = k.split('.'); d[ns][key] = val
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2); f.write('\n')
    print(l, 'ok')
