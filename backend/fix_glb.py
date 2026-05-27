import os, django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.models import OrderRequest
import trimesh
from django.core.files.base import ContentFile

qs = OrderRequest.objects.filter(file_glb='')
for req in qs:
    if req.file_3d:
        print(f'Fixing {req.id}...')
        try:
            mesh = trimesh.load(req.file_3d.path)
            # Some obj files with multiple objects load as trimesh.Scene instead of trimesh.Trimesh
            if hasattr(mesh, 'dump'): 
                mesh = mesh.dump()
                if isinstance(mesh, list) and len(mesh) > 0:
                    mesh = mesh[0]
            glb_data = mesh.export(file_type='glb')
            filename = os.path.splitext(os.path.basename(req.file_3d.name))[0] + '.glb'
            req.file_glb.save(filename, ContentFile(glb_data), save=True)
            print(f'Fixed {req.id} successfully.')
        except Exception as e:
            print(f'Failed {req.id}: {e}')
