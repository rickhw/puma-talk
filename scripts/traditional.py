"""Normalize mixed Chinese input through one consistent Traditional Chinese path."""

class TraditionalNormalizer:
    def __init__(self):
        try:
            from opencc import OpenCC
        except ImportError as error:
            raise RuntimeError('缺少 OpenCC；請在目前 Python 環境安裝 opencc-python-reimplemented==0.1.7') from error
        self.to_simplified=OpenCC('t2s')
        self.to_traditional=OpenCC('s2tw')

    def convert(self,text):
        # Direct s2tw on already-Traditional text mis-converts 里長 -> 裡長,
        # 為了解決 -> 為瞭解決, and 干擾 -> 幹擾 in this dictionary release.
        return self.to_traditional.convert(self.to_simplified.convert(text))
