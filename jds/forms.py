from django import forms


class StyledFormMixin:
    """Gibt allen Eingabefeldern die gemeinsame CSS-Klasse `inp` (siehe templates/base.html)."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.style_fields()

    def style_fields(self):
        for field in self.fields.values():
            if not isinstance(field.widget, (forms.CheckboxInput, forms.CheckboxSelectMultiple, forms.RadioSelect)):
                if 'inp' not in field.widget.attrs.get('class', ''):
                    field.widget.attrs['class'] = (field.widget.attrs.get('class', '') + ' inp').strip()
