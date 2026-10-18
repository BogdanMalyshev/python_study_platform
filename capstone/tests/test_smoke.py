from importlib.metadata import version

import formbuilder
from formbuilder.cli import main


def test_package_is_installed_and_cli_runs() -> None:
    assert formbuilder.__version__ == version("formbuilder")
    assert main(["--help"]) == 0
