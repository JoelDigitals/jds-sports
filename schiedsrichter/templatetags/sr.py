from django import template

register = template.Library()


@register.filter
def eur(value) -> str:
    """1234.5 → '1.234,50 €'"""
    try:
        n = float(value or 0)
    except (TypeError, ValueError):
        return ''
    return f'{n:,.2f} €'.replace(',', 'X').replace('.', ',').replace('X', '.')


@register.filter
def zahl(value) -> str:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return ''
    return f'{n:,.1f}'.rstrip('0').rstrip('.').replace(',', 'X').replace('.', ',').replace('X', '.') if n % 1 else f'{int(n):,}'.replace(',', '.')


STATUS_TON = {
    'angesetzt': 'slate', 'bestätigt': 'blue', 'verlegt': 'amber', 'abgesagt': 'red',
    'ausgefallen_angereist': 'amber', 'ausgefallen_nicht_angereist': 'red', 'geleitet': 'green',
    'offen': 'amber', 'erhalten': 'green', 'nicht_ausgezahlt': 'red',
}


@register.filter
def ton(status: str) -> str:
    return STATUS_TON.get(status, 'slate')
