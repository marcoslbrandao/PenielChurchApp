#!/usr/bin/env python3
# Textos: entrada confirma a vaga, só a gestão cancela e relatório (12/11/2026).
import json, collections
T = {
 'pt': {'status_pendente': 'Aguardando entrada', 'filtro_pendente': 'Aguardando entrada',
        'inscritoPendente': 'Inscrição feita! Sua vaga é confirmada quando a entrada de {{entrada}} for paga. Toque em "Pagar agora".',
        'pendenteInfo': 'Falta pagar {{entrada}} de entrada para confirmar a sua vaga.',
        'canceladaInfo': 'Esta inscrição foi cancelada pela organização. Qualquer dúvida, fale com a gente.',
        'erro_cancelada': 'Sua inscrição foi cancelada pela organização. Fale com a gente para refazer.',
        'relatorio': 'Relatório'},
 'en': {'status_pendente': 'Awaiting deposit', 'filtro_pendente': 'Awaiting deposit',
        'inscritoPendente': 'You’re registered! Your place is confirmed once the {{entrada}} deposit is paid. Tap "Pay now".',
        'pendenteInfo': '{{entrada}} deposit still to pay to confirm your place.',
        'canceladaInfo': 'This registration was cancelled by the organisers. Any questions, please get in touch.',
        'erro_cancelada': 'Your registration was cancelled by the organisers. Please get in touch to register again.',
        'relatorio': 'Report'},
 'es': {'status_pendente': 'Esperando la entrada', 'filtro_pendente': 'Esperando la entrada',
        'inscritoPendente': '¡Inscripción hecha! Tu plaza se confirma cuando pagues la entrada de {{entrada}}. Toca "Pagar ahora".',
        'pendenteInfo': 'Falta pagar {{entrada}} de entrada para confirmar tu plaza.',
        'canceladaInfo': 'La organización canceló esta inscripción. Si tienes dudas, habla con nosotros.',
        'erro_cancelada': 'La organización canceló tu inscripción. Habla con nosotros para rehacerla.',
        'relatorio': 'Informe'},
 'fr': {'status_pendente': 'Acompte en attente', 'filtro_pendente': 'Acompte en attente',
        'inscritoPendente': 'Inscription faite ! Votre place est confirmée dès que l’acompte de {{entrada}} est payé. Touchez « Payer ».',
        'pendenteInfo': 'Il reste {{entrada}} d’acompte à payer pour confirmer votre place.',
        'canceladaInfo': 'Cette inscription a été annulée par l’organisation. Pour toute question, contactez-nous.',
        'erro_cancelada': 'Votre inscription a été annulée par l’organisation. Contactez-nous pour vous réinscrire.',
        'relatorio': 'Rapport'},
}
for l, v in T.items():
    p = f'locales/{l}.json'
    d = json.load(open(p, encoding='utf-8'), object_pairs_hook=collections.OrderedDict)
    d['eventos'].update(v)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2); f.write('\n')
    print(l, 'ok')
