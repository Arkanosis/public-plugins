=head1 LICENSE

Copyright [1999-2013] Wellcome Trust Sanger Institute and the EMBL-European Bioinformatics Institute

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

=cut

package Bio::EnsEMBL::GlyphSet::annotation_status;

use strict;

sub genoverse_attributes {
  my ($self, $f) = @_;
  return ( strand => 1, background => $self->{'config'}->colourmap->hex_by_name($self->my_colour($self->colour_key($f), 'join')) );
}

1;
